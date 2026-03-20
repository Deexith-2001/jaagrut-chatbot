"use client";

import { useState } from "react";
import {
  Box,
  VStack,
  HStack,
  Input,
  IconButton,
  Container,
  Spinner,
  Text,
  Button,
} from "@chakra-ui/react";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Service = {
  title: string;
  link?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  service?: Service | null;
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! 👋 We can help you with PAN, Aadhaar, certificates and more.\n\nWhat do you need help with?",
      service: null,
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentService, setCurrentService] = useState<Service | null>(null);

  // ✅ SEND MESSAGE
  const handleSend = async (text?: string) => {
    const msg = text || input;
    if (!msg.trim() || loading) return;

    const userMsg: Message = { role: "user", content: msg };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: msg,
          currentService,
        }),
      });

      const data = await res.json();

      const botMsg: Message = {
        role: "assistant",
        content: data.reply,
        service: data.service || currentService,
      };

      setCurrentService(data.service || currentService);
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ QUICK SERVICE CLICK
  const handleServiceSelect = (service: Service) => {
    setCurrentService(service);
    handleSend(service.title);
  };

  return (
    <Container maxW="container.md" h="100vh" p={4}>
      <VStack h="full" spacing={4}>
        {/* CHAT */}
        <Box flex={1} w="full" overflowY="auto">
          <VStack spacing={3} align="stretch">
            {messages.map((msg, i) => (
              <Box
                key={i}
                alignSelf={msg.role === "user" ? "flex-end" : "flex-start"}
                bg={msg.role === "user" ? "blue.500" : "gray.200"}
                color={msg.role === "user" ? "white" : "black"}
                px={4}
                py={2}
                borderRadius="lg"
                maxW="80%"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: (props) => (
                      <a
                        {...props}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#3182ce",
                          fontWeight: "bold",
                        }}
                      />
                    ),
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </Box>
            ))}

            {loading && (
              <HStack>
                <Spinner size="sm" />
                <Text fontSize="sm">Thinking...</Text>
              </HStack>
            )}
          </VStack>
        </Box>

        {/* QUICK BUTTONS */}
        <HStack w="full" overflowX="auto">
          {["PAN Card", "Aadhaar Update", "Income Certificate"].map((s) => (
            <Button
              key={s}
              size="sm"
              onClick={() => handleServiceSelect({ title: s })}
            >
              {s}
            </Button>
          ))}
        </HStack>

        {/* INPUT */}
        <HStack w="full">
          <Input
            placeholder="Ask about services..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <IconButton
            aria-label="send"
            icon={<Send />}
            onClick={() => handleSend()}
            isLoading={loading}
          />
        </HStack>
      </VStack>
    </Container>
  );
}