"use client";

import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Container,
  HStack,
  IconButton,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Service = {
  title: string;
  link?: string;
};

type Conversation = {
  language: "English" | "Hindi" | "Telugu";
  stage:
    | "START"
    | "SERVICE_IDENTIFIED"
    | "ASK_USER_INTENT"
    | "SHOW_DOCUMENTS"
    | "SHOW_PROCESS"
    | "SHOW_FEES"
    | "APPLY_LINK"
    | "END";
  currentIntent: string | null;
  currentCategory: string | null;
  currentService: Service | null;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  service?: Service | null;
};

const initialConversation: Conversation = {
  language: "English",
  stage: "START",
  currentIntent: null,
  currentCategory: null,
  currentService: null,
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Welcome to Jaagruk Bharat.\n\nTell me which service you need help with, and I’ll guide you step by step until you can apply.",
      service: null,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<Conversation>(initialConversation);
  const [quickReplies, setQuickReplies] = useState<string[]>([
    "PAN Card",
    "Aadhaar",
    "Passport",
    "Driving License",
  ]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

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
          conversation,
          currentService: conversation.currentService,
        }),
      });

      const data = await res.json();
      const nextConversation = data.conversation || conversation;
      const botMsg: Message = {
        role: "assistant",
        content: data.reply,
        service: data.service || nextConversation.currentService || null,
      };

      setConversation(nextConversation);
      setQuickReplies(data.quickReplies || ["Apply now"]);
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      minH="100vh"
      bg="linear-gradient(180deg, #f6f8fb 0%, #edf2f7 100%)"
      py={{ base: 4, md: 8 }}
    >
      <Container maxW="container.md">
        <VStack
          spacing={4}
          align="stretch"
          bg="white"
          borderRadius="2xl"
          boxShadow="0 24px 60px rgba(15, 23, 42, 0.12)"
          border="1px solid"
          borderColor="gray.200"
          overflow="hidden"
        >
          <Box
            px={{ base: 4, md: 6 }}
            py={{ base: 4, md: 5 }}
            bg="linear-gradient(135deg, #0f766e 0%, #1d4ed8 100%)"
            color="white"
          >
            <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">
              Jaagruk Bharat Assistant
            </Text>
            <Text mt={1} opacity={0.92}>
              Service guidance and application support
            </Text>
            <HStack mt={3} spacing={2} wrap="wrap">
              <Badge bg="whiteAlpha.250" px={3} py={1} borderRadius="full">
                Stage: {conversation.stage}
              </Badge>
              {conversation.currentCategory ? (
                <Badge bg="whiteAlpha.250" px={3} py={1} borderRadius="full">
                  Category: {conversation.currentCategory}
                </Badge>
              ) : null}
            </HStack>
          </Box>

          <Box px={{ base: 4, md: 6 }} h={{ base: "60vh", md: "62vh" }} overflowY="auto">
            <VStack spacing={4} align="stretch" py={4}>
              {messages.map((msg, index) => (
                <Box
                  key={`${msg.role}-${index}`}
                  alignSelf={msg.role === "user" ? "flex-end" : "flex-start"}
                  bg={msg.role === "user" ? "blue.600" : "gray.100"}
                  color={msg.role === "user" ? "white" : "gray.800"}
                  px={4}
                  py={3}
                  borderRadius="2xl"
                  maxW={{ base: "92%", md: "80%" }}
                  whiteSpace="pre-wrap"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <Text mb={3}>{children}</Text>,
                      a: (props) => (
                        <a
                          {...props}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: msg.role === "user" ? "#ffffff" : "#1d4ed8",
                            fontWeight: 700,
                            textDecoration: "underline",
                          }}
                        />
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </Box>
              ))}

              {loading ? (
                <HStack color="gray.500">
                  <Spinner size="sm" />
                  <Text fontSize="sm">Preparing the next step...</Text>
                </HStack>
              ) : null}
            </VStack>
          </Box>

          <Box px={{ base: 4, md: 6 }} pb={2}>
            <HStack spacing={2} wrap="wrap" align="stretch" pb={2}>
              {quickReplies.map((reply) => (
                <Button
                  key={reply}
                  size="sm"
                  borderRadius="full"
                  colorScheme="blue"
                  variant="outline"
                  onClick={() => handleSend(reply)}
                  isDisabled={loading}
                  whiteSpace="normal"
                  h="auto"
                  minH="36px"
                  py={2}
                  px={4}
                  maxW={{ base: "100%", md: "320px" }}
                >
                  {reply}
                </Button>
              ))}
            </HStack>
          </Box>

          <Box px={{ base: 4, md: 6 }} pb={{ base: 4, md: 6 }}>
            <HStack>
              <Input
                size="lg"
                borderRadius="full"
                placeholder="Describe the service you need..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSend();
                  }
                }}
              />
              <IconButton
                aria-label="Send message"
                icon={<Send size={18} />}
                colorScheme="blue"
                borderRadius="full"
                onClick={() => handleSend()}
                isLoading={loading}
              />
            </HStack>
          </Box>
        </VStack>
      </Container>
    </Box>
  );
}
