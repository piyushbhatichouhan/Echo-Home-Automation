# Echo Home Automation

An IoT home automation platform built around the ESP32, featuring real-time device control, cloud connectivity, scheduling, environmental monitoring and power consumption monitoring.

---

## Features

- ESP32-based smart home controller
- Control up to 4 independent relays
- Physical push-button control with state synchronization
- MQTT-based real-time communication
- Firebase cloud integration
- React web dashboard
- Temperature & humidity monitoring (DHT11)
- RTC-based scheduling (Daily / Today / Custom Date)
- LCD status display with automatic night mode
- Manual LCD backlight control
- Wi-Fi auto reconnect
- Power consumption estimation
- Sensor history logging
- Device event logging
- Local state persistence using ESP32 Preferences (NVS)
- Secure MQTT over TLS

---

# Repository Structure

```
echo-home-automation/
│
├── firmware/          # ESP32 PlatformIO firmware
├── backend/           # Node.js backend services
├── web/               # React web dashboard
├── docs/              # Documentation
│
├── README.md
├── LICENSE
└── .gitignore
```

---

# System Architecture

```
                          ┌────────────────────────────┐
                          │      React Dashboard       │
                          │                            │
                          │ • Device Control           │
                          │ • Live Monitoring          │
                          │ • Scheduler                │
                          │ • Device Settings          │
                          │ • Live Serial Monitor      │
                          └──────────┬───────┬─────────┘
                                     │       │
                     Firestore       │       │ MQTT
                                     │       │
                                     ▼       ▼
                         ┌────────────────┐   ┌────────────────────┐
                         │ Cloud Firestore│   │    HiveMQ Cloud    │
                         │                │   │    MQTT Broker     │
                         │ • Schedules    │   │                    │
                         │ • Device Names │   │ • Live Switching   │
                         │ • Settings     │   │ • Sensor Data      │
                         │ • Runtime      │   │ • Status           │
                         │ • History      │   |____________________|
                         └────────┬───────┘           |
                                  │                   |
                                  │                   │
                                  |                   │
                                  │                   │
                                  ▼                   ▼
                       ┌────────────────────┐   ┌────────────────────┐
                       │   Node.js Backend  │   │    ESP32 Device    │
                       │                    │   │                    │
                       │ • Firestore Watch  │   │ • 4 Relay Outputs  │
                       │ • Schedule Sync    │   │ • Push Buttons     │
                       │ • Runtime Storage  │   │ • DHT11 Sensor     │
                       │ • Sensor Logging   │   │ • DS1307 RTC       │
                       │                    │   │ • I²C LCD          │
                       └──────────┬─────────┘   | • Preferences NVS  |
                                  │             │ • Scheduler        │
                                  └────────────►│                    │
                                    Via MQTT    └────────────────────┘
```

---

# Technologies Used

## Firmware

- ESP32
- PlatformIO
- Arduino Framework
- Pubsubclient
- ArduinoJson
- Preferences (NVS)
- DHT Library
- LiquidCrystal_I2C
- RTClib

---

## Backend

- Node.js
- Firebase Admin SDK

---

## Dashboard

- React
- Firebase
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
git clone https://github.com/piyushbhatichouhan/Echo-Home-Automation.git
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
- LCD night mode with manual override
- Runtime analytics
- Power usage estimation
- Web dashboard

---

# Future Improvements

- Wi-Fi configuration portal
- Multi-device support
- Voice assistant integration
- Device grouping
- ESP-NOW support

---

# License

This project is licensed under the MIT License.

---

# Author

Developed by **Piyush Bhati Chouhan**
