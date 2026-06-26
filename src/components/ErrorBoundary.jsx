import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
            fontFamily: "sans-serif",
          }}
        >
          <h2 style={{ marginBottom: "8px" }}>Something went wrong</h2>
          <p style={{ marginBottom: "20px", color: "#555", maxWidth: "320px" }}>
            Don't worry — anything that was already saved before this happened
            is safe. Please reload to continue.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: "10px 24px",
              borderRadius: "6px",
              border: "none",
              background: "#111",
              color: "#fff",
              fontSize: "15px",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
