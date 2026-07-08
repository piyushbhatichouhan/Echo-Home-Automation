# EcHO Home

An end-to-end IoT home automation platform built around the ESP32, featuring real-time device control, cloud connectivity, scheduling, environmental monitoring, OTA firmware updates, and cross-platform management through a web dashboard and mobile application.

EcHO Home is designed to provide reliable local hardware control while leveraging cloud services for remote access, data logging, automation, and monitoring.

---

## Features

- ESP32-based smart home controller
- Control up to 4 independent relays
- Physical push-button control with state synchronization
- MQTT-based real-time communication
- Firebase cloud integration
- React web dashboard
- Flutter mobile application
- Temperature & humidity monitoring (DHT11)
- RTC-based scheduling (Daily / Today / Custom Date)
- LCD status display with automatic night mode
- Manual LCD backlight control
- OTA (Over-The-Air) firmware updates
- Wi-Fi auto reconnect
- Runtime tracking for connected devices
- Power consumption estimation
- Sensor history logging
- Device event logging
- Local state persistence using ESP32 Preferences (NVS)
- Secure MQTT over TLS

---

# Repository Structure

```
echo-home/
│
├── firmware/          # ESP32 PlatformIO firmware
├── backend/           # Node.js backend services
├── dashboard/         # React web dashboard
├── mobile/            # Flutter application
├── docs/              # Documentation
├── assets/            # Images, logos, screenshots
│
├── README.md
├── LICENSE
└── .gitignore
```

---

# System Architecture

```
                 ┌───────────────────┐
                 │ React Dashboard   │
                 └─────────┬─────────┘
                           │
                 ┌─────────▼─────────┐
                 │ Firebase Firestore│
                 └─────────┬─────────┘
                           │
                 ┌─────────▼─────────┐
                 │ Node.js Backend   │
                 └─────────┬─────────┘
                           │
                 HiveMQ Cloud MQTT Broker
                           │
                 ┌─────────▼─────────┐
                 │ ESP32 Controller  │
                 └─────────┬─────────┘
                           │
      ┌────────────────────┼─────────────────────┐
      │                    │                     │
   Relay Module        LCD Display        DHT11 Sensor
      │
 Connected Appliances
```

---

# Technologies Used

## Firmware

- ESP32
- PlatformIO
- Arduino Framework
- MQTT
- ArduinoJson
- Preferences (NVS)
- DHT Library
- LiquidCrystal_I2C
- RTClib
- ArduinoOTA

---

## Backend

- Node.js
- Firebase Admin SDK
- MQTT.js
- Express

---

## Dashboard

- React
- Firebase
- MQTT.js
- CSS

---

## Cloud Services

- Firebase Authentication
- Firebase Firestore
- HiveMQ Cloud MQTT Broker

---

# Installation

## 1. Firmware (ESP32)

### Requirements

- Visual Studio Code
- PlatformIO Extension
- ESP32 Development Board

Clone the repository

```bash
git clone https://github.com/yourusername/echo-home.git
```

Open

```
firmware/
```

Update the following values inside the firmware:

```cpp
#define WIFI_SSID
#define WIFI_PASSWORD

#define MQTT_SERVER
#define MQTT_PORT

#define MQTT_USER
#define MQTT_PASSWORD
```

Build and upload

```bash
PlatformIO: Build
PlatformIO: Upload
```

or

```bash
pio run
pio run --target upload
```

---

## 2. Backend

Navigate to

```bash
cd backend
```

Install dependencies

```bash
npm install
```

Create a Firebase Service Account

Place

```
serviceAccountKey.json
```

inside

```
backend/
```

Create a `.env`

```env
MQTT_HOST=
MQTT_PORT=
MQTT_USERNAME=
MQTT_PASSWORD=

FIREBASE_PROJECT_ID=
```

Start the server

```bash
node server.js
```

or

```bash
npm start
```

---

## 3. Dashboard

Navigate to

```bash
cd dashboard
```

Install dependencies

```bash
npm install
```

Create

```
src/firebase.js
```

using your Firebase project credentials.

Run

```bash
npm run dev
```

Build production

```bash
npm run build
```

---

# MQTT Topics

## Commands

```
echo/switch1
echo/switch2
echo/switch3
echo/switch4
```

Payload

```
1
```

or

```
0
```

---

## State

```
echo/state/switch1
echo/state/switch2
echo/state/switch3
echo/state/switch4
```

---

## Sensors

```
echo/sensor/temperature
echo/sensor/humidity
echo/sensor/history
```

---

## Scheduler

```
echo/schedule
```

---

## Events

```
echo/event
```

---

## Runtime

```
echo/runtime
```

---

## Logs

```
echo/log
```

---

## Device Status

```
echo/status
```

---

# Hardware

- ESP32 DevKit
- 4 Channel Relay Module
- DHT11 Temperature & Humidity Sensor
- DS1307 RTC Module
- 16×2 I²C LCD Display
- Push Buttons
- Power Supply

---

# Project Highlights

- Fully asynchronous MQTT communication
- Secure TLS connection to cloud broker
- Offline state persistence
- Automatic Wi-Fi recovery
- OTA firmware updates
- LCD night mode with manual override
- Runtime analytics
- Power usage estimation
- Modular cloud architecture
- Responsive web dashboard
- Mobile application support

---

# Future Improvements

- Wi-Fi configuration portal
- Multi-device support
- Energy analytics dashboard
- Voice assistant integration
- Push notifications
- Role-based user access
- Device grouping
- Scenes and automation rules
- Matter compatibility
- ESP-NOW support

---

# License

This project is licensed under the MIT License.

---

# Author

Developed by **EcHO**

An IoT platform focused on building reliable, cloud-connected smart home solutions using ESP32, React, Flutter, Firebase, and MQTT.
