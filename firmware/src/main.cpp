#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include <DHT.h>

#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#include <RTClib.h>

#include <time.h>

#include <Preferences.h>

#include <ArduinoOTA.h>
#include <ESPmDNS.h>
// ================= WIFI =================

#define WIFI_SSID " "
#define WIFI_PASSWORD " "

// ================= MQTT =================

#define MQTT_SERVER " "
#define MQTT_PORT 8883

#define MQTT_USER " "
#define MQTT_PASSWORD " "

// ================= PINS =================

#define LED_PIN 13
#define LED_PIN2 16
#define LED_PIN3 26
#define LED_PIN4 27

#define BUTTON_PIN1 17
#define BUTTON_PIN2 25
#define BUTTON_PIN3 18
#define BUTTON_PIN4 23

#define DHTPIN 19
#define DHTTYPE DHT11

#define SDA_PIN 21
#define SCL_PIN 22

#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ================= OBJECTS =================

WiFiClientSecure espClient;

PubSubClient client(espClient);

DHT dht(DHTPIN, DHTTYPE);

LiquidCrystal_I2C lcd(0x27, 16, 2);

RTC_DS1307 rtc;

Preferences prefs;
// ================= CUSTOM LCD ICONS =================

byte waterdrop[] = {
    B00000,
    B00100,
    B01110,
    B11011,
    B10001,
    B10001,
    B10001,
    B01110,
};

byte thermometer[] = {
    B00000,
    B00001,
    B00110,
    B01110,
    B11100,
    B11000,
    B00000,
    B00000,
};

byte centigrade[] = {
    B00110,
    B00110,
    B00000,
    B00000,
    B00000,
    B00000,
    B00000,
    B00000,
};

byte clockq[] = {
    B01110,
    B10001,
    B10011,
    B10101,
    B10001,
    B10001,
    B01110,
    B00000,
};

byte databars[] = {
    B00000,
    B00001,
    B00001,
    B00101,
    B00101,
    B10101,
    B10101,
    B10101,
};

// ================= STATES =================

bool switch1State = false;
bool switch2State = false;
bool switch3State = false;
bool switch4State = false;

bool schedOnEnable[4] = {0};

int schedOnHour[4] = {0};
int schedOnMinute[4] = {0};

bool schedOffEnable[4] = {0};

int schedOffHour[4] = {0};
int schedOffMinute[4] = {0};

String schedOnType[4];
String schedOffType[4];

String schedOnDate[4];
String schedOffDate[4];

float currentTemp = NAN;
float currentHumidity = NAN;

// ================= TIMERS =================

unsigned long lastSensorRead = 0;

unsigned long lastHeartbeat = 0;

unsigned long lcdTimer = 0;

unsigned long lastReconnectAttempt = 0;

const unsigned long sensorInterval = 10000;

const unsigned long heartbeatInterval = 10000;

const unsigned long reconnectInterval = 30000;

unsigned long lastHeapCheck = 0;

int lastTriggerMinute = -1;

const unsigned long debounceDelay = 150;

unsigned long lastButtonTime1 = 0;
unsigned long lastButtonTime2 = 0;
unsigned long lastButtonTime3 = 0;
unsigned long lastButtonTime4 = 0;

unsigned long lastWifiAttempt = 0;
const unsigned long wifiReconnectInterval = 30000; // 30 seconds

unsigned long lastSensorLog = 0;
const unsigned long sensorLogInterval = 60000; // 10 minutes

// ================= RUNTIME TRACKING =================

unsigned long runtimeSeconds[4] = {0};

unsigned long lastRuntimeTick = 0;

const unsigned long runtimePublishInterval =
    5UL * 60UL * 1000UL; // 5 min

// const unsigned long runtimePublishInterval = 10000;

unsigned long lastRuntimePublish = 0;

bool otaStarted = false;

bool wifiConnecting = false;

bool mdnsStarted = false;

volatile bool scheduleUpdateFlag = false;
String scheduleBuffer = "";
String bootId;

bool lcdBacklightEnabled = true;

bool lcdAutoMode = true;

int lcdNightHour = 22;
int lcdMorningHour = 6;

unsigned long lcdWakeUntil = 0;

const unsigned long lcdWakeDuration = 10000; // 10 seconds

TaskHandle_t mqttTaskHandle = NULL;

void mqttLog(String level, String message)
{
    if (WiFi.status() != WL_CONNECTED || !client.connected())
    {
        Serial.println("Cannot log MQTT message, not connected");
        return;
    }
    StaticJsonDocument<256> doc;

    doc["level"] = level;
    doc["msg"] = message;
    doc["millis"] = millis();

    char buffer[256];
    serializeJson(doc, buffer);

    client.publish("echo/log", buffer);
}

void publishRuntimeSnapshot()
{
    StaticJsonDocument<256> doc;
    doc["bootID"] = bootId;
    doc["switch1"] = runtimeSeconds[0];
    doc["switch2"] = runtimeSeconds[1];
    doc["switch3"] = runtimeSeconds[2];
    doc["switch4"] = runtimeSeconds[3];

    char buffer[256];
    serializeJson(doc, buffer);

    if (client.connected())
    {

        client.publish(
            "echo/runtime",
            buffer,
            true);
    }

    // retained

    Serial.println("Runtime snapshot published");
    mqttLog("INFO", "Runtime Snapshot Published");
}

void publishSwitchEvent(
    const char *sw,
    bool state,
    const char *source)
{
    StaticJsonDocument<128> doc;

    doc["switch"] = sw;
    doc["state"] = state;
    doc["source"] = source;

    char buffer[128];

    serializeJson(doc, buffer);
    if (client.connected())
    {

        client.publish(
            "echo/event",
            buffer,
            false);
    }
}

void saveRelayStatesToNVS()
{
    prefs.putBool("sw1", switch1State);
    prefs.putBool("sw2", switch2State);
    prefs.putBool("sw3", switch3State);
    prefs.putBool("sw4", switch4State);
}

void loadRelayStatesFromNVS()
{
    switch1State = prefs.getBool("sw1", false);
    switch2State = prefs.getBool("sw2", false);
    switch3State = prefs.getBool("sw3", false);
    switch4State = prefs.getBool("sw4", false);
}

void publishSwitchStates()
{

    if (client.connected())
    {

        client.publish(
            "echo/state/switch1",
            switch1State ? "1" : "0",
            true);

        client.publish(
            "echo/state/switch2",
            switch2State ? "1" : "0",
            true);

        client.publish(
            "echo/state/switch3",
            switch3State ? "1" : "0",
            true);

        client.publish(
            "echo/state/switch4",
            switch4State ? "1" : "0",
            true);
    }
}

void updateLCDBacklight()
{
    if (!lcdBacklightEnabled)
    {
        lcd.noBacklight();
        return;
    }

    if (!lcdAutoMode)
    {
        lcd.backlight();
        return;
    }

    DateTime now = rtc.now();

    int hour = now.hour();

    bool night =
        (hour >= lcdNightHour ||
         hour < lcdMorningHour);

    // Temporary wake
    if (millis() < lcdWakeUntil)
    {
        lcd.backlight();
        return;
    }

    if (night)
    {
        lcd.noBacklight();
    }
    else
    {
        lcd.backlight();
    }
}

void wakeLCD()
{
    lcdWakeUntil =
        millis() + lcdWakeDuration;

    lcd.backlight();
}

void saveLCDSettingsToNVS()
{
    prefs.putBool("lcd_en", lcdBacklightEnabled);
    prefs.putBool("lcd_auto", lcdAutoMode);

    prefs.putInt("lcd_night", lcdNightHour);
    prefs.putInt("lcd_morn", lcdMorningHour);
}

// ================= MQTT CALLBACK =================

void callback(char *topic, byte *payload, unsigned int length)
{

    String msg;

    for (unsigned int i = 0; i < length; i++)
    {
        msg += (char)payload[i];
    }

    String t = String(topic);

    // ================= SWITCHES =================

    if (t == "echo/switch1")
    {
        bool newState = msg == "1";

        if (switch1State != newState)
        {
            switch1State = newState;
            prefs.putBool("sw1", switch1State);
            publishSwitchEvent(
                "switch1",
                switch1State,
                "mqtt");

            publishSwitchStates();
        }
    }

    if (t == "echo/switch2")
    {
        bool newState = msg == "1";

        if (switch2State != newState)
        {
            switch2State = newState;
            prefs.putBool("sw2", switch2State);
            publishSwitchEvent(
                "switch2",
                switch2State,
                "mqtt");
            publishSwitchStates();
        }
    }

    if (t == "echo/switch3")
    {
        bool newState = msg == "1";

        if (switch3State != newState)
        {
            switch3State = newState;
            prefs.putBool("sw3", switch3State);
            publishSwitchEvent(
                "switch3",
                switch3State,
                "mqtt");
            publishSwitchStates();
        }
    }

    if (t == "echo/switch4")
    {
        bool newState = msg == "1";

        if (switch4State != newState)
        {
            switch4State = newState;
            prefs.putBool("sw4", switch4State);
            publishSwitchEvent(
                "switch4",
                switch4State,
                "mqtt");
            publishSwitchStates();
        }
    }

    // ================= ALL SWITCHES =================

    // ================= APPLY RELAYS =================

    digitalWrite(
        LED_PIN,
        switch1State ? RELAY_ON : RELAY_OFF);

    digitalWrite(
        LED_PIN2,
        switch2State ? RELAY_ON : RELAY_OFF);

    digitalWrite(
        LED_PIN3,
        switch3State ? RELAY_ON : RELAY_OFF);

    digitalWrite(
        LED_PIN4,
        switch4State ? RELAY_ON : RELAY_OFF);

    // ================= SCHEDULE =================

    if (t == "echo/schedule")
    {
        scheduleBuffer = msg;      // just store data
        scheduleUpdateFlag = true; // tell loop to process it
        return;
    }

    if (t == "echo/lcd/settings")
    {
        DynamicJsonDocument doc(256);

        if (!deserializeJson(doc, msg))
        {
            lcdBacklightEnabled =
                doc["enabled"] | true;

            lcdAutoMode =
                doc["auto"] | true;

            lcdNightHour =
                doc["nightHour"] | 22;

            lcdMorningHour =
                doc["morningHour"] | 6;

            saveLCDSettingsToNVS();
            updateLCDBacklight();
        }
    }
}

// ================= MQTT RECONNECT =================

void reconnectMQTT()
{

    if (WiFi.status() != WL_CONNECTED)
        return;

    if (millis() - lastReconnectAttempt < reconnectInterval)
        return;

    lastReconnectAttempt = millis();

    if (client.connected())
        return;

    Serial.println("Connecting MQTT...");

    String clientId =
        "ESP32-" + String(random(1000, 9999));

    if (
        client.connect(
            clientId.c_str(),
            MQTT_USER,
            MQTT_PASSWORD,
            "echo/status",
            1,
            true,
            "offline"))
    {
        Serial.println("MQTT Connected");
        client.subscribe("echo/switch1");
        client.subscribe("echo/switch2");
        client.subscribe("echo/switch3");
        client.subscribe("echo/switch4");
        client.subscribe("echo/test", 1);
        client.subscribe("echo/schedule", 1);
        client.subscribe("echo/lcd/settings");

        client.publish(
            "echo/status",
            "online",
            true);

        publishRuntimeSnapshot();
        publishSwitchStates();
    }
    else
    {
        Serial.print("MQTT Failed: ");

        Serial.println(client.state());
    }
}

// ================= PUBLISH SWITCH STATES =================

void handleWiFi()
{
    // Already connected
    if (WiFi.status() == WL_CONNECTED)
    {
        wifiConnecting = false;
        if (!mdnsStarted)
        {
            if (MDNS.begin("esp32-echo"))
            {
                mdnsStarted = true;
                Serial.println("mDNS started");
                Serial.println("esp32-echo.local");
                mqttLog("INFO", "MDNS Started");
            }
        }

        return;
    }

    // Not connected → try reconnect every 30s
    if (millis() - lastWifiAttempt >= wifiReconnectInterval)
    {
        lastWifiAttempt = millis();

        Serial.println("WiFi reconnecting...");

        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

        wifiConnecting = true;
    }

    if (WiFi.status() != WL_CONNECTED)
    {
        otaStarted = false;
        mdnsStarted = false;
    }
}

void saveScheduleToNVS()
{
    StaticJsonDocument<2048> doc;

    for (int i = 0; i < 4; i++)
    {
        String sw = "switch" + String(i + 1);

        doc[sw]["on"]["enabled"] = schedOnEnable[i];
        doc[sw]["on"]["hour"] = schedOnHour[i];
        doc[sw]["on"]["minute"] = schedOnMinute[i];
        doc[sw]["on"]["scheduleType"] = schedOnType[i];
        doc[sw]["on"]["targetDate"] = schedOnDate[i];

        doc[sw]["off"]["enabled"] = schedOffEnable[i];
        doc[sw]["off"]["hour"] = schedOffHour[i];
        doc[sw]["off"]["minute"] = schedOffMinute[i];
        doc[sw]["off"]["scheduleType"] = schedOffType[i];
        doc[sw]["off"]["targetDate"] = schedOffDate[i];
    }

    String newJson;
    serializeJson(doc, newJson);

    String oldJson =
        prefs.getString("schedule", "");

    if (newJson != oldJson)
    {
        prefs.putString(
            "schedule",
            newJson);
        mqttLog("INFO", "Schedule saved to NVS");
        // Serial.println(
        //     "Schedule saved to NVS");
    }
    else
    {
        mqttLog("INFO", "Schedule unchanged, skip NVS write");
        // Serial.println(
        //     "Schedule unchanged, skip NVS write");
    }
}

void loadScheduleFromNVS()
{

    String json =
        prefs.getString(
            "schedule",
            "");

    if (json.length() == 0)
    {
        mqttLog("INFO", "No saved schedule");
        return;
    }

    StaticJsonDocument<2048> doc;

    if (deserializeJson(doc, json))
    {
        mqttLog("ERROR", "Failed to load schedule");
        return;
    }

    for (int i = 0; i < 4; i++)
    {
        String sw =
            "switch" + String(i + 1);

        schedOnEnable[i] =
            doc[sw]["on"]["enabled"] | false;

        schedOnHour[i] =
            doc[sw]["on"]["hour"] | 0;

        schedOnMinute[i] =
            doc[sw]["on"]["minute"] | 0;

        schedOnType[i] =
            doc[sw]["on"]["scheduleType"] | "daily";

        schedOnDate[i] =
            doc[sw]["on"]["targetDate"] | "";

        schedOffEnable[i] =
            doc[sw]["off"]["enabled"] | false;

        schedOffHour[i] =
            doc[sw]["off"]["hour"] | 0;

        schedOffMinute[i] =
            doc[sw]["off"]["minute"] | 0;

        schedOffType[i] =
            doc[sw]["off"]["scheduleType"] | "daily";

        schedOffDate[i] =
            doc[sw]["off"]["targetDate"] | "";
    }

    mqttLog("INFO", "Schedule loaded from NVS");
}

void handleSchedule()
{
    if (!scheduleUpdateFlag)
        return;

    scheduleUpdateFlag = false;

    mqttLog("INFO", "Received new schedule");

    DynamicJsonDocument doc(4096);

    DeserializationError error =
        deserializeJson(doc, scheduleBuffer);

    if (error)
    {
        Serial.println("Schedule JSON Error");
        mqttLog("ERROR", "Failed to parse schedule JSON");
        return;
    }

    for (int i = 0; i < 4; i++)
    {
        String sw = "switch" + String(i + 1);
        schedOnEnable[i] = doc[sw]["on"]["enabled"] | false;
        schedOnHour[i] = doc[sw]["on"]["hour"] | 0;
        schedOnMinute[i] = doc[sw]["on"]["minute"] | 0;
        schedOnType[i] = doc[sw]["on"]["scheduleType"] | "daily";
        schedOnDate[i] = doc[sw]["on"]["targetDate"] | "";

        schedOffEnable[i] = doc[sw]["off"]["enabled"] | false;
        schedOffHour[i] = doc[sw]["off"]["hour"] | 0;
        schedOffMinute[i] = doc[sw]["off"]["minute"] | 0;
        schedOffType[i] = doc[sw]["off"]["scheduleType"] | "daily";
        schedOffDate[i] = doc[sw]["off"]["targetDate"] | "";
    }

    // Serial.println("Schedule Updated");

    saveScheduleToNVS();
    // debugNVS();
}

void handleOTAStart()
{
    if (otaStarted)
        return;

    if (WiFi.status() == WL_CONNECTED)
    {
        ArduinoOTA.setHostname(OTA_HOST);
        ArduinoOTA.setPassword(OTA_PASSWORD);
        ArduinoOTA.begin();

        Serial.println("OTA Started congrats!");
        otaStarted = true;
    }
}

bool scheduleMatches(
    String type,
    String targetDate,
    DateTime now)
{
    if (type == "daily")
        return true;

    if (type == "today")
        return true;

    if (type == "custom")
    {
        char buf[11];

        sprintf(
            buf,
            "%04d-%02d-%02d",
            now.year(),
            now.month(),
            now.day());

        return targetDate == String(buf);
    }

    return false;
}

void loadLCDSettingsFromNVS()
{
    lcdBacklightEnabled =
        prefs.getBool("lcd_en", true);

    lcdAutoMode =
        prefs.getBool("lcd_auto", true);

    lcdNightHour =
        prefs.getInt("lcd_night", 22);

    lcdMorningHour =
        prefs.getInt("lcd_morn", 6);
}

// ================= SETUP =================

void setup()
{
    Serial.begin(115200);

    // ================= RELAYS =================

    pinMode(LED_PIN, OUTPUT);
    pinMode(LED_PIN2, OUTPUT);
    pinMode(LED_PIN3, OUTPUT);
    pinMode(LED_PIN4, OUTPUT);

    digitalWrite(LED_PIN, RELAY_OFF);
    digitalWrite(LED_PIN2, RELAY_OFF);
    digitalWrite(LED_PIN3, RELAY_OFF);
    digitalWrite(LED_PIN4, RELAY_OFF);

    // ================= BUTTONS =================

    pinMode(BUTTON_PIN1, INPUT_PULLUP);
    pinMode(BUTTON_PIN2, INPUT_PULLUP);
    pinMode(BUTTON_PIN3, INPUT_PULLUP);
    pinMode(BUTTON_PIN4, INPUT_PULLUP);

    // ================= DHT =================

    dht.begin();

    // ================= LCD =================

    Wire.begin(SDA_PIN, SCL_PIN);

    lcd.init();

    lcd.backlight();

    lcd.createChar(0, waterdrop);
    lcd.createChar(1, thermometer);
    lcd.createChar(2, centigrade);
    lcd.createChar(3, clockq);
    lcd.createChar(4, databars);

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Connecting WiFi");

    // ================= RTC =================

    if (!rtc.begin())
    {
        Serial.println("RTC ERROR");
        mqttLog("ERROR", "RTC not found");
    }

    // ================= WIFI =================
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    wifiConnecting = true;

    Serial.println("WiFi starting...");

    // ================= TIME =================

    configTime(
        19800,
        0,
        "pool.ntp.org");

    struct tm timeinfo;

    if (getLocalTime(&timeinfo))
    {
        rtc.adjust(
            DateTime(
                timeinfo.tm_year + 1900,
                timeinfo.tm_mon + 1,
                timeinfo.tm_mday,
                timeinfo.tm_hour,
                timeinfo.tm_min,
                timeinfo.tm_sec));
    }

    // ================= MQTT =================

    espClient.setInsecure();

    client.setServer(
        MQTT_SERVER,
        MQTT_PORT);

    client.setBufferSize(4096);

    client.setCallback(callback);

    lastReconnectAttempt = millis() - reconnectInterval;
    // ================= INITIAL SENSOR =================

    float t = dht.readTemperature();

    float h =
        dht.readHumidity() - 10;

    if (!isnan(t) && !isnan(h))
    {
        currentTemp = t;

        currentHumidity = h;
    }
    prefs.begin("echo", false);

    loadRelayStatesFromNVS();

    digitalWrite(LED_PIN,
                 switch1State ? RELAY_ON : RELAY_OFF);

    digitalWrite(LED_PIN2,
                 switch2State ? RELAY_ON : RELAY_OFF);

    digitalWrite(LED_PIN3,
                 switch3State ? RELAY_ON : RELAY_OFF);

    digitalWrite(LED_PIN4,
                 switch4State ? RELAY_ON : RELAY_OFF);

    randomSeed(esp_random());

    bootId =
        String((uint32_t)esp_random(), HEX) +
        String((uint32_t)esp_random(), HEX);

    loadScheduleFromNVS();
    publishRuntimeSnapshot();
    publishSwitchStates();
    loadLCDSettingsFromNVS();

    updateLCDBacklight();
}

// ================= LOOP =================

void loop()
{

    reconnectMQTT();

    if (client.connected())
    {

        client.loop();
    }

    //    ================= WIFI RECONNECT =================
    handleWiFi();
    handleOTAStart();
    if (otaStarted)
    {
        ArduinoOTA.handle();
    }
    // ================= MQTT =================

    handleSchedule();

    // ================= RUNTIME COUNTER =================

    if (millis() - lastRuntimeTick >= 1000)
    {
        lastRuntimeTick += 1000;

        if (switch1State)
            runtimeSeconds[0]++;
        if (switch2State)
            runtimeSeconds[1]++;
        if (switch3State)
            runtimeSeconds[2]++;
        if (switch4State)
            runtimeSeconds[3]++;
    }

    if (millis() - lastRuntimePublish >=
        runtimePublishInterval)
    {
        lastRuntimePublish = millis();

        publishRuntimeSnapshot();
    }

    // ================= BUTTONS =================

    static bool lastButton1 = HIGH;
    static bool lastButton2 = HIGH;
    static bool lastButton3 = HIGH;
    static bool lastButton4 = HIGH;

    bool button1 = digitalRead(BUTTON_PIN1);
    bool button2 = digitalRead(BUTTON_PIN2);
    bool button3 = digitalRead(BUTTON_PIN3);
    bool button4 = digitalRead(BUTTON_PIN4);

    if (button1 == LOW && lastButton1 == HIGH &&
        millis() - lastButtonTime1 > debounceDelay)
    {

        wakeLCD();
        lastButtonTime1 = millis();
        switch1State = !switch1State;
        prefs.putBool("sw1", switch1State);

        digitalWrite(
            LED_PIN,
            switch1State ? RELAY_ON : RELAY_OFF);

        publishSwitchStates();

        publishSwitchEvent(
            "switch1",
            switch1State,
            "button");
    }
    if (button2 == LOW && lastButton2 == HIGH &&
        millis() - lastButtonTime2 > debounceDelay)
    {
        wakeLCD();
        lastButtonTime2 = millis();

        switch2State = !switch2State;
        prefs.putBool("sw2", switch2State);

        digitalWrite(LED_PIN2,
                     switch2State ? RELAY_ON : RELAY_OFF);

        publishSwitchStates();

        publishSwitchEvent(
            "switch2",
            switch2State,
            "button");
    }

    if (button3 == LOW && lastButton3 == HIGH &&
        millis() - lastButtonTime3 > debounceDelay)
    {
        wakeLCD();
        lastButtonTime3 = millis();

        switch3State = !switch3State;
        prefs.putBool("sw3", switch3State);

        digitalWrite(LED_PIN3,
                     switch3State ? RELAY_ON : RELAY_OFF);

        publishSwitchStates();

        publishSwitchEvent(
            "switch3",
            switch3State,
            "button");
    }

    if (button4 == LOW && lastButton4 == HIGH &&
        millis() - lastButtonTime4 > debounceDelay)
    {
        wakeLCD();
        lastButtonTime4 = millis();

        switch4State = !switch4State;
        prefs.putBool("sw4", switch4State);

        digitalWrite(LED_PIN4,
                     switch4State ? RELAY_ON : RELAY_OFF);

        publishSwitchStates();
        publishSwitchEvent(
            "switch4",
            switch4State,
            "button");
    }

    lastButton1 = button1;
    lastButton2 = button2;
    lastButton3 = button3;
    lastButton4 = button4;

    // ================= DHT =================

    if (millis() - lastSensorRead >
        sensorInterval)
    {
        lastSensorRead = millis();

        float t = dht.readTemperature();

        float h =
            dht.readHumidity() - 10;

        if (!isnan(t) && !isnan(h))
        {
            currentTemp = t;

            currentHumidity = h;

            if (client.connected())
            {
                client.publish(
                    "echo/sensor/temperature",
                    String(t).c_str(),
                    true);

                client.publish(
                    "echo/sensor/humidity",
                    String(h).c_str(),
                    true);
            }
        }
    }

    // ================= HEARTBEAT =================

    if (millis() - lastHeartbeat >
        heartbeatInterval)
    {
        lastHeartbeat = millis();

        if (client.connected())
        {
            client.publish(
                "echo/status",
                "online",
                true);
        }
    }

    static unsigned long lastLCDCheck = 0;

    if (millis() - lastLCDCheck >= 1000)
    {
        lastLCDCheck = millis();

        updateLCDBacklight();
    }

    // ================= LCD =================

    if (millis() - lcdTimer > 1000)
    {
        lcdTimer = millis();

        DateTime now = rtc.now();

        lcd.setCursor(0, 0);

        lcd.write(byte(1));

        lcd.print(" ");

        if (isnan(currentTemp))
        {
            lcd.print("--");
        }
        else
        {
            lcd.print(currentTemp, 1);

            lcd.write(byte(2));

            lcd.print("C");
        }

        lcd.print("  ");

        lcd.write(byte(0));

        lcd.print(" ");

        if (isnan(currentHumidity))
        {
            lcd.print("--%");
        }
        else
        {
            lcd.print((int)currentHumidity);

            lcd.print("%");
        }

        lcd.print("  ");

        lcd.setCursor(0, 1);

        if (now.hour() < 10)
            lcd.print("0");

        lcd.print(now.hour());

        lcd.print(":");

        if (now.minute() < 10)
            lcd.print("0");

        lcd.print(now.minute());

        lcd.print(":");

        if (now.second() < 10)
            lcd.print("0");

        lcd.print(now.second());

        lcd.print("  ");

        lcd.print("WiFi:");

        if (WiFi.status() == WL_CONNECTED)
        {
            lcd.write(byte(4));
        }
        else
        {
            lcd.print("X");
        }

        lcd.print(" ");
    }

    // ================= SCHEDULER =================

    DateTime now = rtc.now();

    if (now.minute() != lastTriggerMinute)
    {
        lastTriggerMinute =
            now.minute();

        updateLCDBacklight();

        bool stateChanged = false;
        for (int i = 0; i < 4; i++)
        {
            bool state = false;

            switch (i)
            {
            case 0:
                state = switch1State;
                break;

            case 1:
                state = switch2State;
                break;

            case 2:
                state = switch3State;
                break;

            case 3:
                state = switch4State;
                break;
            }

            // ON SCHEDULE
            if (
                schedOnEnable[i] &&
                scheduleMatches(
                    schedOnType[i],
                    schedOnDate[i],
                    now) &&
                schedOnHour[i] == now.hour() &&
                schedOnMinute[i] == now.minute())
            {

                if (!state)
                {
                    state = true;
                    stateChanged = true;
                }

                publishSwitchEvent(
                    ("switch" + String(i + 1)).c_str(),
                    true,
                    "schedule");
            }

            // OFF SCHEDULE

            if (
                schedOffEnable[i] &&
                scheduleMatches(
                    schedOffType[i],
                    schedOffDate[i],
                    now) &&
                schedOffHour[i] == now.hour() &&
                schedOffMinute[i] == now.minute())
            {

                if (state)
                {
                    state = false;
                    stateChanged = true;
                }

                publishSwitchEvent(
                    ("switch" + String(i + 1)).c_str(),
                    false,
                    "schedule");
            }

            switch (i)
            {
            case 0:

                switch1State = state;

                digitalWrite(
                    LED_PIN,
                    state ? RELAY_ON : RELAY_OFF);

                break;

            case 1:

                switch2State = state;

                digitalWrite(
                    LED_PIN2,
                    state ? RELAY_ON : RELAY_OFF);

                break;

            case 2:

                switch3State = state;

                digitalWrite(
                    LED_PIN3,
                    state ? RELAY_ON : RELAY_OFF);

                break;

            case 3:

                switch4State = state;

                digitalWrite(
                    LED_PIN4,
                    state ? RELAY_ON : RELAY_OFF);

                break;
            }
        }

        if (stateChanged)
        {
            saveRelayStatesToNVS();
            publishSwitchStates();
        }
    }

    if (millis() - lastSensorLog >= sensorLogInterval)
    {
        lastSensorLog = millis();

        float t = currentTemp;
        float h = currentHumidity;

        if (!isnan(t) && !isnan(h))
        {
            StaticJsonDocument<128> doc;

            doc["temperature"] = t;
            doc["humidity"] = h;

            char buffer[128];
            serializeJson(doc, buffer);

            // Serial.println(buffer);
            if (client.connected())
            {

                client.publish("echo/sensor/history", buffer, false);
            }
        }
    }

    if (millis() - lastHeapCheck >= 10000)
    {

        lastHeapCheck = millis();

        // Serial.println("========== MEMORY INFO ==========");

        // Serial.print("Free Heap: ");
        mqttLog("DEBUG", "Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
        // Serial.print(ESP.getFreeHeap());
        // Serial.println(" bytes");

        // Serial.print("Minimum Free Heap Ever: ");
        // Serial.print(ESP.getMinFreeHeap());
        // Serial.println(" bytes");

        // Serial.print("Largest Free Block: ");
        // Serial.print(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
        // Serial.println(" bytes");

        // Serial.print("Heap Fragmentation: ");

        // uint32_t freeHeap = ESP.getFreeHeap();
        // uint32_t largestBlock =
        //     heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);

        // if (freeHeap > 0)
        // {
        //     float fragmentation =
        //         100.0 - ((largestBlock * 100.0) / freeHeap);

        //     Serial.print(fragmentation);
        //     Serial.println(" %");
        // }

        // Serial.println("=================================");
    }

    yield();
}
