import { useEffect, useState } from "react";
import mqtt from "mqtt";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, collection } from "firebase/firestore";
import { addDoc, serverTimestamp } from "firebase/firestore";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useRef } from "react";
import { query, orderBy, limit } from "firebase/firestore";

import Login from "./login";

import "./settings.css";

export default function Settings({ client }) {
  const [logs, setLogs] = useState([]);
  const logEndRef = useRef(null);
  const [toast, setToast] = useState(null);

  const [names, setNames] = useState({
    switch1: "Switch 1",
    switch2: "Switch 2",
    switch3: "Switch 3",
    switch4: "Switch 4",
  });

  const [powerRatings, setPowerRatings] = useState({
    switch1: 0,
    switch2: 0,
    switch3: 0,
    switch4: 0,
  });

  const [lcdSettings, setLcdSettings] = useState({
    enabled: true,
    auto: true,
    nightHour: 22,
    morningHour: 6,
  });

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "devices", "echo", "settings", "switch_names"),
      (snap) => {
        if (snap.exists()) {
          setNames(snap.data());
        }
      },
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "devices", "echo", "settings", "lcd"),
      (snap) => {
        if (snap.exists()) {
          setLcdSettings(snap.data());
        }
      },
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "devices", "echo", "settings", "power_ratings"),
      (snap) => {
        if (snap.exists()) {
          setPowerRatings(snap.data());
        }
      },
    );

    return () => unsub();
  }, []);

  const saveDeviceSettings = async () => {
    await setDoc(doc(db, "devices", "echo", "settings", "switch_names"), names);

    await setDoc(
      doc(db, "devices", "echo", "settings", "power_ratings"),
      powerRatings,
    );

    setToast({
      type: "success",
      message: "Device settings saved successfully!",
    });

    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const saveLCDSettings = async () => {
    await setDoc(doc(db, "devices", "echo", "settings", "lcd"), lcdSettings);

    if (client?.connected) {
      client.publish("echo/lcd/settings", JSON.stringify(lcdSettings), {
        qos: 1,
        retain: true,
      });
    }

    setToast({
      type: "success",
      message: "LCD settings saved successfully!",
    });

    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!client) return;

    const topic = "echo/log";

    client.subscribe(topic);

    const handler = (t, message) => {
      if (t !== topic) return;

      try {
        const data = JSON.parse(message.toString());

        setLogs((prev) => [
          ...prev,
          {
            level: data.level,
            msg: data.msg,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      } catch {
        setLogs((prev) => [
          ...prev,
          {
            level: "RAW",
            msg: message.toString(),
            time: new Date().toLocaleTimeString(),
          },
        ]);
      }
    };

    client.on("message", handler);

    return () => {
      client.off("message", handler);
    };
  }, [client]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [logs]);

  const clearLogs = () => setLogs([]);

  const getColor = (level) => {
    switch (level) {
      case "INFO":
        return "#22c55e";

      case "ERROR":
        return "#ef4444";

      case "DEBUG":
        return "#38bdf8";

      default:
        return "#aaa";
    }
  };

  return (
    <div className="settingsPage">
      <h1 className="pageTitle">Settings</h1>

      <div className="settingsCard">
        <div className="cardHeader">
          <h2>Device Configuration</h2>

          <button className="saveBtn" onClick={saveDeviceSettings}>
            Save Device Settings
          </button>
        </div>

        <div className="nameGrid">
          <div className="inputGroup">
            <div className="deviceConfigCard">
              <h3>Switch 1</h3>

              <div className="inputGroup">
                <label>Device Name</label>

                <input
                  value={names.switch1}
                  onChange={(e) =>
                    setNames({
                      ...names,
                      switch1: e.target.value,
                    })
                  }
                />
              </div>

              <div className="inputGroup">
                <label>Power Rating (Watts)</label>

                <input
                  type="number"
                  min="0"
                  value={powerRatings.switch1}
                  onChange={(e) =>
                    setPowerRatings({
                      ...powerRatings,
                      switch1: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="inputGroup">
            <div className="deviceConfigCard">
              <h3>Switch 2</h3>

              <div className="inputGroup">
                <label>Device Name</label>

                <input
                  value={names.switch2}
                  onChange={(e) =>
                    setNames({
                      ...names,
                      switch2: e.target.value,
                    })
                  }
                />
              </div>

              <div className="inputGroup">
                <label>Power Rating (Watts)</label>

                <input
                  type="number"
                  min="0"
                  value={powerRatings.switch2}
                  onChange={(e) =>
                    setPowerRatings({
                      ...powerRatings,
                      switch2: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="inputGroup">
            <div className="deviceConfigCard">
              <h3>Switch 3</h3>

              <div className="inputGroup">
                <label>Device Name</label>

                <input
                  value={names.switch3}
                  onChange={(e) =>
                    setNames({
                      ...names,
                      switch3: e.target.value,
                    })
                  }
                />
              </div>

              <div className="inputGroup">
                <label>Power Rating (Watts)</label>

                <input
                  type="number"
                  min="0"
                  value={powerRatings.switch3}
                  onChange={(e) =>
                    setPowerRatings({
                      ...powerRatings,
                      switch3: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="inputGroup">
            <div className="deviceConfigCard">
              <h3>Switch 4</h3>

              <div className="inputGroup">
                <label>Device Name</label>

                <input
                  value={names.switch4}
                  onChange={(e) =>
                    setNames({
                      ...names,
                      switch4: e.target.value,
                    })
                  }
                />
              </div>

              <div className="inputGroup">
                <label>Power Rating (Watts)</label>

                <input
                  type="number"
                  min="0"
                  value={powerRatings.switch4}
                  onChange={(e) =>
                    setPowerRatings({
                      ...powerRatings,
                      switch4: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <div className="settingsCard">
          <div className="cardHeader">
            <h2>LCD Backlight Settings</h2>

            <button className="saveBtn" onClick={saveLCDSettings}>
              Save LCD Settings
            </button>
          </div>

          <div className="lcdGrid">
            <div className="toggleRow">
              <label>LCD Enabled</label>

              <input
                type="checkbox"
                checked={lcdSettings.enabled}
                onChange={(e) =>
                  setLcdSettings({
                    ...lcdSettings,
                    enabled: e.target.checked,
                  })
                }
              />
            </div>

            <div className="toggleRow">
              <label>Automatic Schedule</label>

              <input
                type="checkbox"
                checked={lcdSettings.auto}
                onChange={(e) =>
                  setLcdSettings({
                    ...lcdSettings,
                    auto: e.target.checked,
                  })
                }
              />
            </div>

            {lcdSettings.auto && (
              <>
                <div className="inputGroup">
                  <label>Night Hour</label>

                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={lcdSettings.nightHour}
                    onChange={(e) =>
                      setLcdSettings({
                        ...lcdSettings,
                        nightHour: Number(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="inputGroup">
                  <label>Morning Hour</label>

                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={lcdSettings.morningHour}
                    onChange={(e) =>
                      setLcdSettings({
                        ...lcdSettings,
                        morningHour: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </>
            )}

            {!lcdSettings.auto && (
              <div className="manualControls">
                <button
                  className="saveBtn"
                  onClick={() =>
                    setLcdSettings({
                      ...lcdSettings,
                      enabled: true,
                    })
                  }
                >
                  Turn ON
                </button>

                <button
                  className="clearBtn"
                  onClick={() =>
                    setLcdSettings({
                      ...lcdSettings,
                      enabled: false,
                    })
                  }
                >
                  Turn OFF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="settingsCard">
        <div className="cardHeader">
          <h2>Live Serial Monitor</h2>

          <button className="clearBtn" onClick={clearLogs}>
            Clear Logs
          </button>
        </div>

        <div className="logContainer">
          {logs.map((log, i) => (
            <div key={i} className="logRow">
              <span className="logTime">{log.time}</span>

              <span
                className="logLevel"
                style={{
                  color: getColor(log.level),
                }}
              >
                [{log.level}]
              </span>

              <span className="logMsg">{log.msg}</span>
            </div>
          ))}

          <div ref={logEndRef} />
        </div>
      </div>
      {toast && (
        <div className={`toast ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
