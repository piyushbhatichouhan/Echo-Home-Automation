import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { getDocs, where } from "firebase/firestore";
import { useRef } from "react";
import { Timestamp } from "firebase/firestore";
import "./Analytics.css";
import {FaRegLightbulb, FaHistory} from "react-icons/fa"
import {BsFan} from "react-icons/bs"
import { PiFanLight } from "react-icons/pi"
import { IoHomeOutline, IoSettingsOutline} from "react-icons/io5";
import { TbDeviceAnalytics } from "react-icons/tb";
import { ImPower } from "react-icons/im";


function Analytics() {

    const sidebaricons = {  
home: <IoHomeOutline />,
history: <FaHistory />,
sensors: <TbDeviceAnalytics />,
power: <ImPower />,
settings: <IoSettingsOutline />
  };
  
  const [data, setData] = useState([]);
  const [mode, setMode] = useState("live"); // live | history
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const chartRef = useRef(null);
const handleStart = (e) => {
  setStartTime(new Date(e.target.value));
};

const handleEnd = (e) => {
  setEndTime(new Date(e.target.value));
};
const fetchHistoricalData = async () => {
  if (!startTime || !endTime) return;
 
  setMode("history");

  const q = query(
    collection(db, "devices", "echo", "sensor_history"),
    where("timestamp", ">=", Timestamp.fromDate(startTime)),
    where("timestamp", "<=", Timestamp.fromDate(endTime)),
    orderBy("timestamp", "asc")
  );

  const snapshot = await getDocs(q);

  const rows = snapshot.docs.map((doc) => {
    const d = doc.data();

    return {
      time: d.timestamp?.toDate?.().toLocaleString(),
      temperature: d.temperature,
      humidity: d.humidity,
    };
  });

  setData(rows);
};

  const downloadChart = () => {
  const chart = chartRef.current?.getEchartsInstance();

  const url = chart.getDataURL({
    type: "png",
    backgroundColor: "#fff",
  });

  const a = document.createElement("a");
  a.href = url;
  a.download = `sensor-${mode}-${Date.now()}.png`;
  a.click();
};

const downloadCSV = () => {
  const header = "time,temperature,humidity\n";

  const rows = data
    .map(d => `${d.time},${d.temperature},${d.humidity}`)
    .join("\n");

  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "sensor-data.csv";
  a.click();
};
 useEffect(() => {
  if (mode !== "live") return;

  const q = query(
    collection(db, "devices", "echo", "sensor_history"),
    orderBy("timestamp", "desc"),
    limit(200)
  );

  const unsub = onSnapshot(q, (snapshot) => {
    const rows = snapshot.docs
      .map((doc) => {
        const d = doc.data();

        return {
          time: d.timestamp?.toDate?.().toLocaleTimeString() || "",
          temperature: d.temperature,
          humidity: d.humidity,
        };
      })
      .reverse();

    setData(rows);
  });

  return () => unsub();
}, [mode]); // 🔥 FIXED []);

  const option = {
    title: {
      text: "Real-Time Sensor Analytics",
    },
    tooltip: {
      trigger: "axis",
    },
    legend: {
      data: ["Temperature", "Humidity"],
    },
    xAxis: {
      type: "category",
      data: data.map((d) => d.time),
    },
    yAxis: {
      type: "value",
    },
    series: [
      {
        name: "Temperature",
        type: "line",
        smooth: true,
        data: data.map((d) => d.temperature),
        lineStyle: { color: "#ff4d4d" },
      },
      {
        name: "Humidity",
        type: "line",
        smooth: true,
        data: data.map((d) => d.humidity),
        lineStyle: { color: "#4da6ff" },
      },
    ],
  };

  return (
    <div style={{ padding: 20 }}>
     <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
  

  <div className={`liveIndicator ${mode === "live" ? "on" : "off"}`}>
    <span className="dot" />
    {mode === "live" ? "Streaming Live Data" : "Historical View"}
  </div>
</div>
      <h2>Sensor Analytics</h2>
      <div style={{ marginBottom: 10, alignItems: "center", display: "flex", justifyContent: "center" }}>
        <button className="modeBtn" onClick={() => setMode("live")}>
          Live Mode
        </button>

      <input type="datetime-local" onChange={handleStart} />
<input type="datetime-local" onChange={handleEnd} />

        <button className="modeBtn" onClick={fetchHistoricalData}>
          Load History
        </button>
        <button className="modeBtn" onClick={downloadChart}>
  Download PNG
</button>

<button className="modeBtn" onClick={downloadCSV}>
  Download CSV
</button>
      </div>
      <ReactECharts
          ref={chartRef}
  option={option}
  style={{ height: "600px", width: "100%" }}
      />
    </div>
  );
}

export default Analytics;
