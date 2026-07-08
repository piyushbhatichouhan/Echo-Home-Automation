require("dotenv").config();

const mqtt = require("mqtt");

const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const runtimeSnapshotRef = db
  .collection("devices")
  .doc("echo")
  .collection("settings")
  .doc("runtime_snapshot");

let powerRatings = {};

db.collection("devices")
  .doc("echo")
  .collection("settings")
  .doc("power_ratings")
  .onSnapshot((snap) => {
    if (snap.exists) {
      powerRatings = snap.data();

      console.log("⚡ Power ratings loaded:", powerRatings);
    }
  });

console.log("✅ Firestore Connected");

const http = require("http");

let lastSensorSeen = Date.now();
let offlineNotified = false;

const USER_UID = "ldMux5f3kvc69gYTTLd10WpnE0k1";

const sentReminders = new Set();

let schedulesWatcherStarted = false;
let schedulesCache = {};

// ================= POWER TRACKING =================

const server = http.createServer((req, res) => {
  if (req.url === "/ping") {
    res.writeHead(200);
    return res.end("alive");
  }

  res.writeHead(200);
  res.end("EcHO Backend Running");
});

server.listen(process.env.PORT || 10000);

async function checkScheduleReminders() {
  try {
    if (Object.keys(schedulesCache).length === 0) return;

    const now = new Date();

    for (const [docId, schedule] of Object.entries(schedulesCache)) {
      if (!schedule.enabled) continue;

      const hour = schedule.hour;
      const minute = schedule.minute;

      const scheduleType = schedule.scheduleType || "daily";

      const targetDate = schedule.targetDate || "";

      const scheduleTime = new Date();

      scheduleTime.setHours(hour);
      scheduleTime.setMinutes(minute);
      scheduleTime.setSeconds(0);
      scheduleTime.setMilliseconds(0);

      // DAILY
      if (scheduleType === "daily") {
        if (scheduleTime < now) {
          scheduleTime.setDate(scheduleTime.getDate() + 1);
        }
      }

      // TODAY
      else if (scheduleType === "today") {
        // schedule already points to today

        if (scheduleTime < now) {
          return;
        }
      }

      // CUSTOM DATE
      else if (scheduleType === "custom" && targetDate) {
        const [y, m, d] = targetDate.split("-");

        scheduleTime.setFullYear(Number(y), Number(m) - 1, Number(d));

        if (scheduleTime < now) {
          return;
        }
      }

      const reminderTime = scheduleTime.getTime() - 30 * 60 * 1000;

      const id = `${docId}-${scheduleTime.getTime()}`;

      //   console.log(
      //   `${doc.id}
      //   now=${now.toLocaleString()}
      //   execute=${scheduleTime.toLocaleString()}
      //   reminder=${new Date(reminderTime).toLocaleString()}`
      // );

      if (
        now.getTime() >= reminderTime &&
        now.getTime() < reminderTime + 60000 &&
        !sentReminders.has(id)
      ) {
        sentReminders.add(id);
        const executionTime = scheduleTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        await sendNotificationToUser(
          USER_UID,
          "Upcoming Schedule",
          `${docId} will execute in 30 minutes at ${executionTime}`,
        );

        // console.log("🔔 Reminder sent:", doc.id);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function cleanupExpiredSchedules() {
  try {
    if (Object.keys(schedulesCache).length === 0) return;

    const now = new Date();

    for (const [docId, schedule] of Object.entries(schedulesCache)) {
      if (!schedule.enabled) continue;

      const type = schedule.scheduleType || "daily";

      if (type === "daily") continue;
      const scheduleTime = new Date();

      scheduleTime.setHours(schedule.hour || 0);
      scheduleTime.setMinutes(schedule.minute || 0);
      scheduleTime.setSeconds(0);
      scheduleTime.setMilliseconds(0);

      // TODAY
      if (type === "today") {
        // current date already correct
      }

      // CUSTOM
      else if (type === "custom" && schedule.targetDate) {
        const [y, m, d] = schedule.targetDate.split("-");

        scheduleTime.setFullYear(Number(y), Number(m) - 1, Number(d));
      }

      // today uses current date automatically

      if (now > scheduleTime) {
        await db
          .collection("devices")
          .doc("echo")
          .collection("schedules")
          .doc(docId)
          .update({
            enabled: false,
          });

        console.log("🧹 Disabled expired schedule:", docId);
      }
    }
  } catch (err) {
    console.error("❌ Schedule cleanup failed", err);
  }
}

// ================= MQTT =================
async function sendNotificationToUser(uid, title, body) {
  try {
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      console.log("❌ User document not found");
      return;
    }

    const token = userDoc.data().fcmToken;

    if (!token) {
      console.log("❌ No FCM token found");
      return;
    }

    const message = {
      token,
      data: {
        hello: "world",
      },
    };

    console.log(JSON.stringify(message, null, 2));
    const response = await admin.messaging().send({
      token,
      notification: {
        title,
        body,
      },
    });

    console.log("✅ Notification sent:", response);
  } catch (err) {
    console.error("❌ Notification error:", err);
  }
}
async function testNotification(token) {
  try {
    const response = await admin.messaging().send({
      token,
      notification: {
        title: "EcHO Test",
        body: "Push notifications are working!",
      },
      android: {
        notification: {
          icon: "ic_launcher",
          color: "#2196F3",
        },
      },
    });
    console.log("Notification sent:", response);
  } catch (error) {
    console.error("Notification error:", error);
  }
}

async function handleRuntimeSnapshot(data) {
  try {
    const snap = await runtimeSnapshotRef.get();

    const previous = snap.exists ? snap.data() : {};
    const currentBootId = data.bootId || null;

    const previousBootId = previous.bootId || null;
    const rebootDetected = previousBootId && previousBootId !== currentBootId;
    const date = new Date().toISOString().split("T")[0];

    delete data.bootId;

    const powerLogRef = db
      .collection("devices")
      .doc("echo")
      .collection("power_logs")
      .doc(date);

    const updates = {};

    for (const sw of Object.keys(data)) {
      const current = Number(data[sw]) || 0;

      const old = Number(previous[sw]) || 0;

      let delta = current - old;

      if (rebootDetected) {
        console.log(`🔄 ESP reboot detected`);

        delta = current;
      } else if (delta < 0) {
        delta = current;
      }

      if (delta === 0) continue;

      const watts = powerRatings[sw] || 0;

      const kwh = (watts * delta) / 3600 / 1000;

      updates[`${sw}.runtime`] = admin.firestore.FieldValue.increment(delta);

      updates[`${sw}.kwh`] = admin.firestore.FieldValue.increment(kwh);

      console.log({
        switch: sw,
        delta,
        watts,
        kwh,
      });
    }

    if (Object.keys(updates).length) {
      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await powerLogRef.set(updates, { merge: true });
    }

    await runtimeSnapshotRef.set(
      {
        bootId: currentBootId,
        ...data,
      },
      { merge: true },
    );

    console.log("⚡ Runtime snapshot processed");
  } catch (err) {
    console.error("Runtime processing failed", err);
  }
}

function connectMQTT() {
  const client = mqtt.connect({
    host: process.env.MQTT_HOST,
    port: process.env.MQTT_PORT,
    protocol: "mqtts",
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 2000,
    keepalive: 10,
    clean: true,
  });

  const originalPublish = client.publish.bind(client);

  client.publish = function (topic, message, options) {
    console.log("📤 MQTT PUBLISH");
    console.log("Topic:", topic);
    console.log("Payload:", message.toString());
    return originalPublish(topic, message, options);
  };

  return client;
}

function attachMQTTHandlers() {
  client.on("connect", async () => {
    console.log("MQTT Connected");

    console.log("⚡ Loaded Power Ratings:");
    console.log(powerRatings);

    client.subscribe("echo/event");
    client.subscribe("echo/sensor/history");
    client.subscribe("echo/runtime");

    if (!schedulesWatcherStarted) {
      watchSchedules();
      schedulesWatcherStarted = true;
    }
  });

  client.on("error", (err) => {
    console.error("❌ MQTT Error:", err);
  });

  client.on("offline", () => {
    console.log("⚠ MQTT Offline");
  });

  client.on("reconnect", () => {
    console.log("🔄 MQTT Reconnecting...");
  });

  client.on("close", () => {
    console.log("❌ MQTT Connection Closed");
  });

  client.on("message", async (topic, payload) => {
    try {
      const msg = payload.toString();

      console.log(topic, msg);

      if (topic === "echo/runtime") {
        const data = JSON.parse(payload.toString());

        await handleRuntimeSnapshot(data);

        return;
      }

      // ================= SENSOR HISTORY =================

      if (topic === "echo/sensor/history") {
        try {
          const data = JSON.parse(msg);

          lastSensorSeen = Date.now();
          offlineNotified = false;

          await db
            .collection("devices")
            .doc("echo")
            .collection("sensor_history")
            .add({
              temperature: Number(data.temperature),
              humidity: Number(data.humidity),
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });

          console.log("✅ Sensor history saved");
        } catch (err) {
          console.error("❌ Sensor history save failed:", err);
        }
      }

      // ================= SWITCH HISTORY =================

      if (topic === "echo/event") {
        try {
          console.log("🚨 EVENT RECEIVED");
          console.log(msg);
          const event = JSON.parse(msg);

          // ================= POWER TRACKING =================

          await db.collection("devices").doc("echo").collection("history").add({
            switch: event.switch,
            state: event.state,
            source: event.source,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log("✅ Switch history saved");
        } catch (err) {
          console.error("❌ Switch history save failed:", err);
        }
      }
    } catch (err) {
      console.error("❌ Message processing failed:", err);
    }
  });
}

let client;

async function start() {
  client = connectMQTT();

  attachMQTTHandlers();
}

start();

function watchSchedules() {
  db.collection("devices")
    .doc("echo")
    .collection("schedules")
    .onSnapshot(async (snapshot) => {
      try {
        const data = {};
        console.log(
          "📅 schedules snapshot fired",
          snapshot.docChanges().length,
        );
        schedulesCache = {};
        snapshot.forEach((doc) => {
          const schedule = doc.data();

          data[doc.id] = schedule;

          schedulesCache[doc.id] = schedule;
        });

        const payload = {
          switch1: {
            on: data.switch1_on || {},
            off: data.switch1_off || {},
          },

          switch2: {
            on: data.switch2_on || {},
            off: data.switch2_off || {},
          },

          switch3: {
            on: data.switch3_on || {},
            off: data.switch3_off || {},
          },

          switch4: {
            on: data.switch4_on || {},
            off: data.switch4_off || {},
          },
        };

        const json = JSON.stringify(payload);

        // console.log("📤 SCHEDULE PUBLISH");
        // console.log(json);

        client.publish("echo/schedule", json, {
          qos: 1,
          retain: true,
        });

        console.log("✅ Schedule sent to ESP");
      } catch (err) {
        console.error("❌ Schedule publish failed:", err);
      }
    });
}

// ================= MQTT ERRORS =================

// ================= MESSAGE HANDLER =================

// ================= CRASH PROTECTION =================

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

// ================= PROCESS ERRORS =================

// ================= STARTUP CHECK =================

console.log("🚀 Backend Started");

setInterval(() => {
  console.log("💓 Backend Alive", new Date().toISOString());
  // testNotification(
  //   "dbJtvjQPSM6QoSzLopN31s:APA91bH44K3Y911HIUIp4OINwNwQgRlZbQpdni_17P_9x3tjPG5h0SVRIhFyMSKYp-UWpR8lDI9UL9BJshNyGjqnoaeKJ0hozigUbvT_L5knab_KDgIaLQw",
  // );
}, 15000);

setInterval(
  () => {
    http.get(`http://localhost:${process.env.PORT || 10000}/ping`);
  },
  4 * 60 * 1000,
);

// setInterval(() => {
//   sendNotificationToUser(
//     "ldMux5f3kvc69gYTTLd10WpnE0k1",
//     "EcHO Test",
//     "Notification system is working 🚀",
//   );
//   console.log("✅ Test notification sent");
// }, 5000);

setInterval(async () => {
  const OFFLINE_LIMIT = 5 * 60 * 1000; // 5 minutes

  if (Date.now() - lastSensorSeen > OFFLINE_LIMIT && !offlineNotified) {
    offlineNotified = true;

    await sendNotificationToUser(
      USER_UID,
      "EcHO Device Offline",
      "Your home automation device has not reported data for 5 minutes.",
    );

    console.log("⚠ Offline notification sent");
  }
}, 60000);

setInterval(checkScheduleReminders, 60000);

setInterval(cleanupExpiredSchedules, 60000);
