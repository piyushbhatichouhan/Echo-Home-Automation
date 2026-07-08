import { useEffect, useState } from "react";
import mqtt from "mqtt";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, collection } from "firebase/firestore";
import { addDoc, serverTimestamp } from "firebase/firestore";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useRef } from "react";
import { query, orderBy, limit, where } from "firebase/firestore";

import Login from "./login";

import "./App.css";
import Analytics from "./Analytics";
import Settings from "./Settings";
import PowerDashboard from "./powerDashboard";

import { FaRegLightbulb, FaHistory, FaThermometerHalf } from "react-icons/fa";
import { BsFan } from "react-icons/bs";
import { PiFanLight } from "react-icons/pi";
import {
  IoHomeOutline,
  IoSettingsOutline,
  IoWifiOutline,
} from "react-icons/io5";
import { TbDeviceAnalytics } from "react-icons/tb";
import { ImPower } from "react-icons/im";
import { CiMicrophoneOn } from "react-icons/ci";
import { WiHumidity } from "react-icons/wi";
import { RiCalendarScheduleLine } from "react-icons/ri";

// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration

// Initialize Firebase

function App() {
  // ================= AUTH =================

  const [user, setUser] = useState(null);

  // ================= MQTT =================

  const [client, setClient] = useState(null);

  // ================= STATES =================

  const [switches, setSwitches] = useState({
    switch1: false,
    switch2: false,
    switch3: false,
    switch4: false,
  });

  const [switchNames, setSwitchNames] = useState({
    switch1: "Light 2",
    switch2: "Cooler",
    switch3: "Light 1",
    switch4: "Fan",
  });

  const [temperature, setTemperature] = useState("--");

  const [humidity, setHumidity] = useState("--");

  const [online, setOnline] = useState(false);

  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const [page, setPage] = useState("home");

  const [history, setHistory] = useState([]);

  const [sensorHistory, setSensorHistory] = useState([]);

  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState("");

  const [lastCommand, setLastCommand] = useState(null);

  const [historyRange, setHistoryRange] = useState("1");

  const [pending, setPending] = useState({});
  // ================= SCHEDULES =================

  const [schedules, setSchedules] = useState({
    switch1: {
      on: {
        enabled: false,
        time: "00:00",
        scheduleType: "daily",
        targetDate: "",
      },
      off: {
        enabled: false,
        time: "00:00",
        scheduleType: "daily",
        targetDate: "",
      },
    },

    switch2: {
      on: {
        enabled: false,
        time: "00:00",
        scheduleType: "daily",
        targetDate: "",
      },
      off: {
        enabled: false,
        time: "00:00",
        scheduleType: "daily",
        targetDate: "",
      },
    },

    switch3: {
      on: {
        enabled: false,
        time: "00:00",
        scheduleType: "daily",
        targetDate: "",
      },
      off: {
        enabled: false,
        time: "00:00",
        scheduleType: "daily",
        targetDate: "",
      },
    },

    switch4: {
      on: {
        enabled: false,
        time: "00:00",
        scheduleType: "daily",
        targetDate: "",
      },
      off: {
        enabled: false,
        time: "00:00",
        scheduleType: "daily",
        targetDate: "",
      },
    },
  });

  // ================= LABELS =================

  const icons = {
    switch1: <FaRegLightbulb />,
    switch2: <BsFan />,
    switch3: <FaRegLightbulb />,
    switch4: <PiFanLight />,
  };

  const sidebaricons = {
    home: <IoHomeOutline />,
    history: <FaHistory />,
    sensors: <TbDeviceAnalytics />,
    power: <ImPower />,
    settings: <IoSettingsOutline />,
    mic: <CiMicrophoneOn />,
    thermometer: <FaThermometerHalf />,
    humidity: <WiHumidity />,
    wifi: <IoWifiOutline />,
    schedule: <RiCalendarScheduleLine />,
  };

  const switchOrder = ["switch1", "switch2", "switch3", "switch4"];

  function normalizeNumberWords(text) {
    return text
      .toLowerCase()
      .replace(/\bzero\b/g, "0")
      .replace(/\bone\b/g, "1")
      .replace(/\btwo\b/g, "2")
      .replace(/\bthree\b/g, "3")
      .replace(/\bfour\b/g, "4")
      .replace(/\bfive\b/g, "5")
      .replace(/\bsix\b/g, "6")
      .replace(/\bseven\b/g, "7")
      .replace(/\beight\b/g, "8")
      .replace(/\bnine\b/g, "9");
  }

  function normalizeActionWords(text) {
    return (
      text
        .toLowerCase()

        // fix speech glitches
        .replace(/\boff\b/g, "OFF")
        .replace(/\bof\b/g, "OFF") // 🔥 main fix: "off" → "of"
        .replace(/\bon\b/g, "ON")

        // protect boundaries (prevents partial matches later)
        .replace(/\bON\b/g, " on ")
        .replace(/\bOFF\b/g, " off ")
    );
  }

  function normalizeVoiceText(text) {
    return (
      text
        .toLowerCase()
        .trim()

        // phonetic fixes (IMPORTANT)
        .replace(/\bswitch\s+to\b/g, "switch 2")
        .replace(/\bswitch\s+too\b/g, "switch 2")

        // optional extra robustness
        .replace(/\bfor\b/g, "4")
        .replace(/\bwon\b/g, "1")
    );
  }

  function normalizeTimeText(t) {
    return t
      .toLowerCase()
      .replace(/\b(\d)\s*p\s*m\b/g, "$1 pm")
      .replace(/\b(\d)\s*a\s*m\b/g, "$1 am")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseRelativeTime(text) {
    const t = text.toLowerCase();

    // in 10 minutes / after 10 minutes
    let minMatch = t.match(/(?:in|after)\s+(\d+)\s*minute/);
    if (minMatch) {
      return { type: "minutes", value: parseInt(minMatch[1]) };
    }

    // in 2 hours / after 2 hours
    let hourMatch = t.match(/(?:in|after)\s+(\d+)\s*hour/);
    if (hourMatch) {
      return { type: "hours", value: parseInt(hourMatch[1]) };
    }

    // half an hour
    if (t.includes("half an hour") || t.includes("30 minutes")) {
      return { type: "minutes", value: 30 };
    }

    return null;
  }

  function parseTime(text) {
    const t = text.toLowerCase();

    // 1. 12-hour format with optional :minutes + am/pm
    let match12 = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);

    if (match12) {
      let hour = parseInt(match12[1]);
      let minute = match12[2] ? parseInt(match12[2]) : 0;
      let period = match12[3].replace(/\./g, "").toLowerCase();

      if (period === "pm" && hour !== 12) hour += 12;
      if (period === "am" && hour === 12) hour = 0;

      return { hour, minute };
    }

    // 2. fallback 24-hour ONLY if no am/pm exists
    let match24 = t.match(/\b(\d{1,2}):(\d{2})\b/);
    if (match24) {
      return {
        hour: parseInt(match24[1]),
        minute: parseInt(match24[2]),
      };
    }

    return null;
  }

  function parseVoiceCommand(text) {
    let t = normalizeVoiceText(text);
    t = normalizeNumberWords(t);
    t = normalizeActionWords(t);

    console.log("🧼 NORMALIZED:", t);

    let action = null;

    if (/\boff\b/.test(t)) action = "0";
    else if (/\bon\b/.test(t)) action = "1";

    if (t.includes("all")) {
      return { all: true, state: /off/.test(t) ? "0" : "1", raw: t };
    }
    if (!action) return null;

    // extract switch number
    let sw = null;

    const match = t.match(/switch\s*(\d)/);
    if (match) {
      sw = Number(match[1]);
    }

    if (!sw) {
      const wordMatch = t.match(/\b(one|two|three|four|1|2|3|4)\b/);
      const map = {
        one: 1,
        two: 2,
        three: 3,
        four: 4,
      };

      if (wordMatch) {
        sw = map[wordMatch[1]] || Number(wordMatch[1]);
      }
    }

    return {
      switch: sw,
      state: action,
      raw: t,
    };
  }

  function parseScheduleCommand(text) {
    let t = text.toLowerCase();
    t = normalizeNumberWords(t);
    t = normalizeActionWords(t);

    // STEP 0: detect switch + action FIRST (IMPORTANT FIX)
    let sw = null;
    let all = false;

    if (t.includes("all")) {
      all = true;
    } else {
      const match = t.match(/switch\s*(\d)/);
      if (match) sw = Number(match[1]);
    }

    const action = t.includes("off") ? "0" : "1";

    // STEP 1: relative time
    const relative = parseRelativeTime(t);
    if (relative) {
      const now = new Date();
      let target = new Date(now);

      if (relative.type === "minutes") {
        target.setMinutes(target.getMinutes() + relative.value);
      }

      if (relative.type === "hours") {
        target.setHours(target.getHours() + relative.value);
      }

      return {
        relative: true,
        all,
        switch: sw,
        action,
        hour: target.getHours(),
        minute: target.getMinutes(),
        raw: t,
        repeat: t.includes("daily") ? "daily" : "once",
      };
    }

    // STEP 2: absolute time
    const time = parseTime(t);
    if (!time) return null;

    return {
      all,
      switch: sw,
      action,
      hour: time.hour,
      minute: time.minute,
      raw: t,
      repeat: t.includes("daily") ? "daily" : "once",
    };
  }
  // ================= AUTH =================

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);

    return () => unsub();
  }, []);

  // ================= MQTT =================
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "devices", "echo", "settings", "switch_names"),
      (snap) => {
        if (snap.exists()) {
          setSwitchNames(snap.data());
        }
      },
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;

    const mqttClient = mqtt.connect(
      "wss://73faa7b48c884bdfa924fe3d364148d0.s1.eu.hivemq.cloud:8884/mqtt",
      {
        username: "echoadmin",
        password: "Piyush@1",
        reconnectPeriod: 5000,
      },
    );

    mqttClient.on("connect", () => {
      console.log("MQTT Connected");

      setOnline(true);

      // ================= SUBSCRIBE =================

      mqttClient.subscribe("echo/state/switch1");
      mqttClient.subscribe("echo/state/switch2");
      mqttClient.subscribe("echo/state/switch3");
      mqttClient.subscribe("echo/state/switch4");

      mqttClient.subscribe("echo/sensor/temperature");

      mqttClient.subscribe("echo/sensor/humidity");

      mqttClient.subscribe("echo/status");
      mqttClient.subscribe("echo/event");
    });

    // ================= RECEIVE =================

    mqttClient.on("message", (topic, message) => {
      const msg = message.toString();
      console.log("📩 MQTT RAW:", topic, msg);
      // console.log(topic, msg);

      setLastUpdate(Date.now());

      if (topic === "echo/event") {
        try {
          const event = JSON.parse(msg);
        } catch (err) {
          console.log(err);
        }
      }
      // ================= SWITCH STATES =================

      if (topic.startsWith("echo/state/")) {
        const key = topic.split("/")[2]; // switch1

        setPending((p) => ({
          ...p,
          [key]: false,
        }));

        setSwitches((prev) => ({
          ...prev,
          [key]: msg === "1",
        }));
      }
      // ================= SENSORS =================

      // ================= STATUS =================

      if (topic === "echo/status") {
        setOnline(msg === "online");
      }
      if (topic === "echo/sensor/temperature") {
        const temp = Number(msg);

        console.log("🌡 Temperature:", temp);
        setTemperature(temp);
      }

      if (topic === "echo/sensor/humidity") {
        const hum = Number(msg);

        console.log("💧 Humidity:", hum);
        setHumidity(hum);
      }
      if (topic === "echo/sensor/history") {
        try {
          const data = JSON.parse(msg);

          const entry = {
            temperature: Number(data.temperature),
            humidity: Number(data.humidity),
            timestamp: Date.now(),
          };

          console.log("Sensor entry received:", entry);

          // update UI only
          setSensorHistory((prev) => {
            const updated = [entry, ...prev];
            return updated.slice(0, 500);
          });

          // WRITE TO FIRESTORE HERE (ONLY PLACE)
          try {
            console.log("🔥 Writing to Firestore...");

            console.log("✅ Firestore write success:", ref.id);
          } catch (err) {
            console.error("❌ Firestore write FAILED:", err.code, err.message);
          }
        } catch (err) {
          console.log("sensor history parse error", err);
        }
      }

      // ================= SCHEDULE =================
    });

    mqttClient.on("close", () => {
      setOnline(false);

      console.log("MQTT Closed");
    });

    mqttClient.on("error", (err) => {
      console.log(err);

      setOnline(false);
    });

    setClient(mqttClient);

    return () => mqttClient.end();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let q;

    if (historyRange === "all") {
      q = query(
        collection(db, "devices", "echo", "history"),
        orderBy("timestamp", "desc"),
        limit(1000),
      );
    } else {
      const days = parseInt(historyRange);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      q = query(
        collection(db, "devices", "echo", "history"),
        where("timestamp", ">=", startDate),
        orderBy("timestamp", "desc"),
        limit(1000),
      );
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const rows = [];

      snapshot.forEach((doc) => {
        rows.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      setHistory(rows);
    });

    return () => unsub();
  }, [user, historyRange]);

  // ================= ONLINE CHECK =================

  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(
      collection(db, "devices", "echo", "schedules"),
      (snapshot) => {
        const data = {};

        snapshot.forEach((docSnap) => {
          data[docSnap.id] = docSnap.data();
        });

        setSchedules({
          switch1: {
            on: {
              enabled: data.switch1_on?.enabled || false,
              time: `${String(data.switch1_on?.hour || 0).padStart(2, "0")}:${String(data.switch1_on?.minute || 0).padStart(2, "0")}`,
              scheduleType: data.switch1_on?.scheduleType || "daily",
              targetDate: data.switch1_on?.targetDate || "",
            },
            off: {
              enabled: data.switch1_off?.enabled || false,
              time: `${String(data.switch1_off?.hour || 0).padStart(2, "0")}:${String(data.switch1_off?.minute || 0).padStart(2, "0")}`,
              scheduleType: data.switch1_off?.scheduleType || "daily",
              targetDate: data.switch1_off?.targetDate || "",
            },
          },

          switch2: {
            on: {
              enabled: data.switch2_on?.enabled || false,
              time: `${String(data.switch2_on?.hour || 0).padStart(2, "0")}:${String(data.switch2_on?.minute || 0).padStart(2, "0")}`,
              scheduleType: data.switch2_on?.scheduleType || "daily",
              targetDate: data.switch2_on?.targetDate || "",
            },
            off: {
              enabled: data.switch2_off?.enabled || false,
              time: `${String(data.switch2_off?.hour || 0).padStart(2, "0")}:${String(data.switch2_off?.minute || 0).padStart(2, "0")}`,
              scheduleType: data.switch2_off?.scheduleType || "daily",
              targetDate: data.switch2_off?.targetDate || "",
            },
          },

          switch3: {
            on: {
              enabled: data.switch3_on?.enabled || false,
              time: `${String(data.switch3_on?.hour || 0).padStart(2, "0")}:${String(data.switch3_on?.minute || 0).padStart(2, "0")}`,
              scheduleType: data.switch3_on?.scheduleType || "daily",
              targetDate: data.switch3_on?.targetDate || "",
            },
            off: {
              enabled: data.switch3_off?.enabled || false,
              time: `${String(data.switch3_off?.hour || 0).padStart(2, "0")}:${String(data.switch3_off?.minute || 0).padStart(2, "0")}`,
              scheduleType: data.switch3_off?.scheduleType || "daily",
              targetDate: data.switch3_off?.targetDate || "",
            },
          },

          switch4: {
            on: {
              enabled: data.switch4_on?.enabled || false,
              time: `${String(data.switch4_on?.hour || 0).padStart(2, "0")}:${String(data.switch4_on?.minute || 0).padStart(2, "0")}`,
              scheduleType: data.switch4_on?.scheduleType || "daily",
              targetDate: data.switch4_on?.targetDate || "",
            },
            off: {
              enabled: data.switch4_off?.enabled || false,
              time: `${String(data.switch4_off?.hour || 0).padStart(2, "0")}:${String(data.switch4_off?.minute || 0).padStart(2, "0")}`,
              scheduleType: data.switch4_off?.scheduleType || "daily",
              targetDate: data.switch4_off?.targetDate || "",
            },
          },
        });
      },
    );

    return () => unsub();
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - lastUpdate > 20000) {
        setOnline(false);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [lastUpdate]);

  // ================= TOGGLE =================

  const toggleSwitch = (key) => {
    if (!client || !online) return;

    // current actual state
    const currentState = switches[key];

    // publish opposite state
    const nextState = currentState ? "0" : "1";

    // console.log("Publishing:", key, nextState);

    client.publish("echo/" + key, nextState, {
      qos: 1,
      retain: false,
    });
  };

  const startVoice = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      let text = event.results[0][0].transcript.toLowerCase();

      text = normalizeVoiceText(text);

      const intent = parseVoiceCommand(text);

      const scheduleIntent = parseScheduleCommand(text);

      if (scheduleIntent) {
        console.log("⏰ SCHEDULE DETECTED:", scheduleIntent);

        const swList = scheduleIntent.all
          ? [1, 2, 3, 4]
          : scheduleIntent.switch
            ? [scheduleIntent.switch]
            : [];

        if (swList.length === 0) {
          console.log("❌ No valid switch found for scheduling");
          return;
        }

        swList.forEach(async (i) => {
          const key = `switch${i}_${scheduleIntent.action === "1" ? "on" : "off"}`;

          await setDoc(doc(db, "devices", "echo", "schedules", key), {
            enabled: true,
            hour: scheduleIntent.hour,
            minute: scheduleIntent.minute,

            scheduleType: scheduleIntent.repeat === "daily" ? "daily" : "today",

            targetDate: "",

            createdAt: serverTimestamp(),
            source: "voice",
          });
        });

        setVoiceText(text);
        setLastCommand({
          type: "command",
          switch: intent.switch,
          state: intent.state,
          raw: text,
        });

        setLastCommand({
          type: "schedule",
          all: scheduleIntent.all,
          switch: scheduleIntent.switch,
          action: scheduleIntent.action,
          hour: scheduleIntent.hour,
          minute: scheduleIntent.minute,
          raw: text,
        });
        // alert(
        //   scheduleIntent.all
        //     ? `⏰ All switches scheduled`
        //     : `⏰ Switch ${scheduleIntent.switch} scheduled at ${scheduleIntent.hour}:${scheduleIntent.minute}`
        // );

        return;
      }
      console.log("🧠 PARSED INTENT:", intent);

      // ✅ HANDLE "ALL" FIRST
      if (intent?.all) {
        const state = intent.state;

        console.log("🎯 ALL SWITCH COMMAND:", state);

        for (let i = 1; i <= 4; i++) {
          const key = `switch${i}`;

          client.publish(`echo/${key}`, state, {
            qos: 1,
            retain: false,
          });
        }

        // ✅ ADD THIS (this is your missing piece)
        setVoiceText(text);
        setLastCommand(intent);

        return;
      }

      // ❌ THEN VALIDATE SINGLE SWITCH
      if (!intent || !intent.switch) {
        console.log("❌ No switch detected");
        return;
      }

      const key = `switch${intent.switch}`;

      if (!switches.hasOwnProperty(key)) {
        console.log("❌ Invalid switch:", key);
        return;
      }

      // MQTT publish
      client.publish(`echo/${key}`, intent.state, {
        qos: 1,
        retain: false,
      });

      setVoiceText(text);
      setLastCommand(intent);
    };

    recognition.onend = () => setListening(false);

    recognition.start();
  };

  const map = {
    one: "1",
    two: "2",
    to: "2",
    three: "3",
    four: "4",
  };

  // ================= SCHEDULE UPDATE =================

  const updateSchedule = async (sw, type, field, value) => {
    let targetDateValue = schedules[sw][type].targetDate;

    if (field === "scheduleType" && value !== "custom") {
      targetDateValue = "";
    }
    const updated = {
      ...schedules,

      [sw]: {
        ...schedules[sw],

        [type]: {
          ...schedules[sw][type],

          [field]: value,

          ...(field === "scheduleType" && value !== "custom"
            ? { targetDate: "" }
            : {}),
        },
      },
    };

    setSchedules(updated);

    // ================= CONVERT =================

    const payload = {};

    Object.keys(updated).forEach((k) => {
      const onTime = updated[k].on.time.split(":");

      const offTime = updated[k].off.time.split(":");

      payload[k] = {
        on: {
          enabled: updated[k].on.enabled,

          hour: parseInt(onTime[0]),
          minute: parseInt(onTime[1]),

          scheduleType: updated[k].on.scheduleType,

          targetDate: updated[k].on.targetDate || "",
        },

        off: {
          enabled: updated[k].off.enabled,

          hour: parseInt(offTime[0]),

          minute: parseInt(offTime[1]),

          scheduleType: updated[k].off.scheduleType,

          targetDate: updated[k].off.targetDate || "",
        },
      };
    });
    // console.log("Saving schedule to Firestore");
    // console.log(payload);
    // console.log("MQTT client connected?", client?.connected);

    try {
      for (const key of Object.keys(payload)) {
        await setDoc(
          doc(db, "devices", "echo", "schedules", `${key}_on`),
          payload[key].on,
          { merge: true },
        );

        await setDoc(
          doc(db, "devices", "echo", "schedules", `${key}_off`),
          payload[key].off,
          { merge: true },
        );
      }

      console.log("✅ Schedule saved");
    } catch (err) {
      console.error("❌ Schedule save failed", err);
    }
  };
  const exportExcel = () => {
    const data = history.map((item) => ({
      Time: item.timestamp?.toDate?.()?.toLocaleString() || "",

      Switch: switchNames[item.switch] || item.switch,

      State:
        item.state === 1 || item.state === true || item.state === "1"
          ? "ON"
          : "OFF",

      Source: item.source,
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "History");

    const excelBuffer = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
    });

    saveAs(new Blob([excelBuffer]), "Echo_History.xlsx");
  };
  // ================= LOGIN =================

  if (!user) return <Login />;

  // ================= UI =================

  return (
    <div className="mainLayout">
      <div className="sidebar">
        <h2>EcHO</h2>

        <div
          className={page === "home" ? "navItem active" : "navItem"}
          onClick={() => setPage("home")}
        >
          <span className="sidedeviceicon"> {sidebaricons.home}</span> Home
        </div>

        <div
          className={page === "history" ? "navItem active" : "navItem"}
          onClick={() => setPage("history")}
        >
          <span className="sidedeviceicon"> {sidebaricons.history}</span>{" "}
          History
        </div>

        <div
          className={page === "analytics" ? "navItem active" : "navItem"}
          onClick={() => setPage("analytics")}
        >
          <span className="sidedeviceicon"> {sidebaricons.sensors}</span>{" "}
          Sensors
        </div>
        <div
          className={page === "power" ? "navItem active" : "navItem"}
          onClick={() => setPage("power")}
        >
          <span className="sidedeviceicon"> {sidebaricons.power} </span> Power
        </div>
        <div
          className={page === "settings" ? "navItem active" : "navItem"}
          onClick={() => setPage("settings")}
        >
          <span className="sidedeviceicon">{sidebaricons.settings} </span>{" "}
          Settings
        </div>
      </div>

      <div className="container">
        {page === "home" && (
          <>
            <div className="topBar">
              <div>
                <h1>Home Dashboard</h1>

                <p className={online ? "onlineDot" : "offlineDot"}>
                  ● {online ? "Online" : "Offline"}
                </p>
              </div>

              <button className="logout" onClick={() => signOut(auth)}>
                Logout
              </button>
            </div>

            <div className="sensorGrid">
              <div className="heroCard">
                <div className="deviceicon"> {sidebaricons.thermometer} </div>

                <div>
                  <div className="small">Temperature</div>

                  <div className="big">{temperature}°C</div>
                </div>
              </div>

              <div className="heroCard">
                <div className="deviceicon1"> {sidebaricons.humidity} </div>

                <div>
                  <div className="small">Humidity</div>

                  <div className="big">{humidity}%</div>
                </div>
              </div>

              <div
                className={`heroCard ${online ? "statusCard" : "statusCardOffline"}`}
              >
                <div className="deviceicon1"> {sidebaricons.wifi} </div>

                <div>
                  <div className="small">Status</div>

                  <div className="big">{online ? "Online" : "Offline"}</div>
                  <div className={online ? "green" : "red"}>
                    {online
                      ? "All systems normal"
                      : "Device Offline - Scheduling still available"}
                  </div>
                </div>
              </div>

              <div className="heroCard voiceCard" onClick={startVoice}>
                <div className="deviceicon">{sidebaricons.mic}</div>

                <div>
                  <div className="small">Voice Control</div>

                  <div className="big">
                    {listening ? "Listening..." : "Tap to speak"}
                  </div>

                  {lastCommand && (
                    <div className="voiceMeta">
                      {lastCommand.type === "schedule" ? (
                        <>
                          Scheduled{" "}
                          {lastCommand.all ? (
                            <>ALL SWITCHES</>
                          ) : (
                            <>
                              Switch <b>{lastCommand.switch}</b>
                            </>
                          )}{" "}
                          → <b>{lastCommand.action === "1" ? "ON" : "OFF"}</b>{" "}
                          at{" "}
                          <b>
                            {String(lastCommand.hour).padStart(2, "0")}:
                            {String(lastCommand.minute).padStart(2, "0")}
                          </b>
                        </>
                      ) : (
                        <>
                          Switch <b>{lastCommand.switch}</b> →{" "}
                          <b>{lastCommand.state === "1" ? "ON" : "OFF"}</b>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid">
              {switchOrder.map((key) => (
                <div className="card" key={key}>
                  <div className="cardTop">
                    <div className="switchInfo">
                      <div className="deviceicon">{icons[key]}</div>

                      <div>
                        <h2>{switchNames[key] || `Switch ${key.slice(-1)}`}</h2>

                        <div
                          className={switches[key] ? "badge on" : "badge off"}
                        >
                          {switches[key] ? "ON" : "OFF"}
                        </div>
                      </div>
                    </div>

                    <button
                      className={`toggle ${!online ? "toggleDisabled" : ""}`}
                      onClick={() => toggleSwitch(key)}
                      disabled={!online || pending[key]}
                    >
                      {online ? "⏻ Toggle" : "⚠ Offline"}
                    </button>
                  </div>

                  <hr />

                  <div className="scheduleRow">
                    <div className="scheduleSide">
                      <h4>🗓 ON Schedule</h4>
                      <div className="scheduleTypeBadge">
                        {schedules[key]?.on?.scheduleType || "daily"}
                      </div>
                      <div className="scheduleLabel">
                        Enable
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={schedules[key]?.on?.enabled || false}
                            onChange={(e) =>
                              updateSchedule(
                                key,
                                "on",
                                "enabled",
                                e.target.checked,
                              )
                            }
                          />

                          <span className="slider"></span>
                        </label>
                      </div>

                      <div className="scheduleControls">
                        <select
                          className="scheduleSelect"
                          value={schedules[key]?.on?.scheduleType || "daily"}
                          onChange={(e) =>
                            updateSchedule(
                              key,
                              "on",
                              "scheduleType",
                              e.target.value,
                            )
                          }
                        >
                          <option value="today">Today</option>

                          <option value="daily">Every Day</option>
                          <option value="custom">Custom Date</option>
                        </select>

                        <input
                          type="time"
                          value={schedules[key]?.on?.time || "00:00"}
                          onChange={(e) =>
                            updateSchedule(key, "on", "time", e.target.value)
                          }
                        />

                        {schedules[key]?.on?.scheduleType === "custom" && (
                          <input
                            type="date"
                            className="scheduleDate"
                            value={schedules[key]?.on?.targetDate || ""}
                            onChange={(e) =>
                              updateSchedule(
                                key,
                                "on",
                                "targetDate",
                                e.target.value,
                              )
                            }
                          />
                        )}
                      </div>
                    </div>

                    <div className="divider"></div>

                    <div className="scheduleSide">
                      <h4>🗓 OFF Schedule</h4>
                      <div className="scheduleTypeBadge">
                        {schedules[key]?.off?.scheduleType || "daily"}
                      </div>
                      <div className="scheduleLabel">
                        Enable
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={schedules[key]?.off?.enabled || false}
                            onChange={(e) =>
                              updateSchedule(
                                key,
                                "off",
                                "enabled",
                                e.target.checked,
                              )
                            }
                          />

                          <span className="slider"></span>
                        </label>
                      </div>

                      <div className="scheduleControls">
                        <select
                          className="scheduleSelect"
                          value={schedules[key]?.off?.scheduleType || "daily"}
                          onChange={(e) =>
                            updateSchedule(
                              key,
                              "off",
                              "scheduleType",
                              e.target.value,
                            )
                          }
                        >
                          <option value="today">Today</option>

                          <option value="daily">Every Day</option>
                          <option value="custom">Custom Date</option>
                        </select>

                        <input
                          type="time"
                          value={schedules[key]?.off?.time || "00:00"}
                          onChange={(e) =>
                            updateSchedule(key, "off", "time", e.target.value)
                          }
                        />

                        {schedules[key]?.off?.scheduleType === "custom" && (
                          <input
                            type="date"
                            className="scheduleDate"
                            value={schedules[key]?.off?.targetDate || ""}
                            onChange={(e) =>
                              updateSchedule(
                                key,
                                "off",
                                "targetDate",
                                e.target.value,
                              )
                            }
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="footer">
              <div>Echo Smart Home</div>
            </div>
          </>
        )}

        {page === "history" && (
          <div>
            <div className="topBar">
              <div>
                <h1>Home Dashboard</h1>
              </div>

              <button className="toggle1" onClick={exportExcel}>
                Download Excel
              </button>
            </div>
            <div className="historyToolbar">
              <select
                value={historyRange}
                onChange={(e) => setHistoryRange(e.target.value)}
                className="historySelect"
              >
                <option value="1">Today</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
              </select>
            </div>
            <div className="card historyContainer">
              <table className="historyTable">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Switch</th>
                    <th>State</th>
                    <th>Source</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td>{item.timestamp?.toDate?.()?.toLocaleString()}</td>

                      <td>
                        {switchNames[item.switch] ??
                          `Switch ${item.switch?.replace("switch", "")}`}
                      </td>

                      <td>
                        {item.state === 1 ||
                        item.state === true ||
                        item.state === "1"
                          ? "ON"
                          : "OFF"}
                      </td>

                      <td>{item.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {page === "settings" && <Settings client={client} />}

        {page === "analytics" && <Analytics />}

        {page === "power" && <PowerDashboard />}
      </div>
    </div>
  );
}

export default App;
