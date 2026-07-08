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
import { getDocs, where, documentId } from "firebase/firestore";
import Login from "./login";
import { getDoc } from "firebase/firestore";
import { FaRegLightbulb, FaHistory } from "react-icons/fa";
import { BsFan } from "react-icons/bs";
import { PiFanLight } from "react-icons/pi";
import { IoHomeOutline, IoSettingsOutline } from "react-icons/io5";
import { TbDeviceAnalytics } from "react-icons/tb";
import { ImPower } from "react-icons/im";
import ReactECharts from "echarts-for-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import "./power.css";

export default function PowerDashboard() {
  const sidebaricons = {
    home: <IoHomeOutline />,
    history: <FaHistory />,
    sensors: <TbDeviceAnalytics />,
    power: <ImPower />,
    settings: <IoSettingsOutline />,
  };

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const [powerData, setPowerData] = useState({});
  const [loading, setLoading] = useState(false);
  const [graphDays, setGraphDays] = useState(7);
  const [graphData, setGraphData] = useState([]);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [periodDays, setPeriodDays] = useState(7);

  const [switchNames, setSwitchNames] = useState({
    switch1: "Light 2",
    switch2: "Cooler",
    switch3: "Light 1",
    switch4: "Fan",
  });

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
    const fetchData = async () => {
      setLoading(true);

      try {
        const ref = doc(db, "devices", "echo", "power_logs", selectedDate);

        const snap = await getDoc(ref);

        if (snap.exists()) {
          console.log("POWER DATA:", snap.data());
          setPowerData(snap.data());
        } else {
          console.log("No power data for:", selectedDate);
          setPowerData({});
        }
      } catch (err) {
        console.error("Power fetch error:", err);
      }

      setLoading(false);
    };

    fetchData();
  }, [selectedDate]);

  useEffect(() => {
    const fetchGraphData = async () => {
      const endDate = new Date();

      const startDate = new Date();
      startDate.setDate(endDate.getDate() - (graphDays - 1));

      const startStr = startDate.toISOString().split("T")[0];

      const endStr = endDate.toISOString().split("T")[0];

      const q = query(
        collection(db, "devices", "echo", "power_logs"),
        where(documentId(), ">=", startStr),
        where(documentId(), "<=", endStr),
      );

      const snapshot = await getDocs(q);

      const chartData = [];

      snapshot.docs
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((docSnap) => {
          const day = docSnap.data();

          let total = 0;

          ["switch1", "switch2", "switch3", "switch4"].forEach((sw) => {
            total += day[`${sw}.kwh`] || 0;
          });

          const label = new Date(docSnap.id).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          });

          chartData.push({
            date: label,
            energy: Number(total.toFixed(3)),
          });
        });

      setGraphData(chartData);
    };

    fetchGraphData();
  }, [graphDays]);

  useEffect(() => {
    const fetchPeriodTotal = async () => {
      let total = 0;

      for (let i = 0; i < periodDays; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);

        const dateStr = d.toISOString().split("T")[0];

        const snap = await getDoc(
          doc(db, "devices", "echo", "power_logs", dateStr),
        );

        if (snap.exists()) {
          const day = snap.data();

          ["switch1", "switch2", "switch3", "switch4"].forEach((sw) => {
            total += day[`${sw}.kwh`] || 0;
          });
        }
      }

      setPeriodTotal(total);
    };

    fetchPeriodTotal();
  }, [periodDays]);

  return (
    <div className="powerPage">
      <h1 className="pageTitle"> Power Analytics</h1>

      <div className="settingsCard">
        <div className="cardHeader">
          <h2>Daily Energy Usage</h2>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="dateInput"
          />
        </div>

        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading data...</p>
        ) : (
          <div className="powerGrid">
            {["switch1", "switch2", "switch3", "switch4"].map((sw) => {
              const runtime = powerData?.[`${sw}.runtime`] || 0;
              const kwh = powerData?.[`${sw}.kwh`] || 0;

              return (
                <div key={sw} className="powerCard">
                  <h3>{switchNames[sw] || `Switch ${sw.slice(-1)}`}</h3>

                  <p>⏱ Runtime: {(runtime / 3600).toFixed(2)} hrs</p>

                  <p>⚡ Energy: {kwh.toFixed(4)} kWh</p>
                </div>
              );
            })}
          </div>
        )}
        <div className="periodCard">
          <h2>
            Energy Used In Last {periodDays} {periodDays === 1 ? "Day" : "Days"}
          </h2>

          <h1>{periodTotal.toFixed(3)} kWh</h1>

          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="rangeSelect"
          >
            <option value={1}>1 Day</option>
            <option value={7}>7 Days</option>
            <option value={15}>15 Days</option>
            <option value={30}>30 Days</option>
            <option value={90}>90 Days</option>
          </select>
        </div>

        <div className="graphSection">
          <div className="graphHeader">
            <h2>Energy Consumption Trend</h2>

            <select
              value={graphDays}
              onChange={(e) => setGraphDays(Number(e.target.value))}
              className="rangeSelect"
            >
              <option value={7}>7 Days</option>
              <option value={15}>15 Days</option>
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
            </select>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={graphData}>
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="date" />

              <YAxis />

              <Tooltip />

              <Bar dataKey="energy" fill="#38bdf8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
