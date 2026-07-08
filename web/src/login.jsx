import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";
import "./Login.css";
import logo from "./assets/logo.jpg";

console.log("Logo:", logo);
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const handleLogin = async () => {
    setLoading(true); // ALWAYS spin immediately

    setMessage("");
    setMessageType("");

    if (!email.trim() || !password.trim()) {
      setMessage("Please enter email and password");
      setMessageType("error");
      setLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);

      setMessage("Login successful");
      setMessageType("success");
    } catch (err) {
      let msg = "Login failed";

      switch (err.code) {
        case "auth/user-not-found":
          msg = "No account found";
          break;

        case "auth/wrong-password":
          msg = "Incorrect password";
          break;

        case "auth/invalid-email":
          msg = "Invalid email address";
          break;

        case "auth/too-many-requests":
          msg = "Too many attempts. Try again later";
          break;

        default:
          msg = "Invalid credentials";
      }

      setMessage(msg);
      setMessageType("error");
    } finally {
      setTimeout(() => {
        setLoading(false);
      }, 500);
    }
  };
  return (
    <div className="loginPage">
      <div className="loginCard">
        {/* <img src={logo} alt="EcHO" className="logo" /> */}

        <h1>EcHO</h1>

        <p className="subtitle">Home Automation Dashboard</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="loginInput"
          />

          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="loginInput"
          />
          {message && (
            <div
              className={`loginMessage ${
                messageType === "error"
                  ? "loginMessageError"
                  : "loginMessageSuccess"
              }`}
            >
              {message}
            </div>
          )}
          <button
            type="submit"
            className={`loginButton ${loading ? "loading" : ""}`}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Signing In...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
