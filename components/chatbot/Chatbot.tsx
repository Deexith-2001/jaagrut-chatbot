"use client";

import { useState } from "react";

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<any[]>([]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { role: "user", content: input }];
    setMessages(newMessages);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: input }),
    });

    const data = await res.json();

    setMessages([
      ...newMessages,
      { role: "assistant", content: data.reply },
    ]);

    setInput("");
  };

  return (
    <div>
      {/* Button */}
      <button
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          padding: "10px",
          background: "blue",
          color: "white",
        }}
        onClick={() => setOpen(!open)}
      >
        My Bot
      </button>

      {/* Chat Window */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "60px",
            right: "20px",
            width: "300px",
            height: "400px",
            background: "white",
            border: "1px solid #ccc",
            padding: "10px",
            overflow: "hidden",
          }}
        >
          {/* Messages */}
          <div style={{ height: "80%", overflowY: "auto" }}>
            {messages.map((msg, i) => (
              <div key={i}>
                <b>{msg.role}:</b> {msg.content}
              </div>
            ))}
          </div>

          {/* Input */}
          <div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something..."
              style={{ width: "70%" }}
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}