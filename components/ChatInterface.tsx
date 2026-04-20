"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
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
import { io, Socket } from "socket.io-client";

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

type SessionMode = "bot" | "human";
type SessionStatus = "active" | "escalated" | "closed";

type SessionUpdate = {
  id: string;
  mode: SessionMode;
  status: SessionStatus;
};

type SocketMessage = {
  sessionId: string;
  sender: "user" | "bot" | "admin";
  message: string;
};

type EscalationState = {
  channelName: string;
  agentId: string;
  agentName: string;
};

const initialConversation: Conversation = {
  language: "English",
  stage: "START",
  currentIntent: null,
  currentCategory: null,
  currentService: null,
};

export default function ChatInterface() {
  const generatedSessionIdRef = useRef(crypto.randomUUID());
  const socketRef = useRef<Socket | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
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
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [profileSubmitted, setProfileSubmitted] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>("bot");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("active");
  const [supportRequested, setSupportRequested] = useState(false);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [escalation, setEscalation] = useState<EscalationState | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const isBackendSupportMode =
    supportRequested &&
    !!escalation &&
    sessionMode !== "human" &&
    sessionStatus !== "closed";
  const socketUrl = useMemo(
    () => process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4001",
    []
  );

  useEffect(() => {
    const socket = io(socketUrl, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("session_updated", (session: SessionUpdate | null) => {
      if (!session || session.id !== activeSessionIdRef.current) return;

      setSessionMode((prev) => {
        if (prev !== "human" && session.mode === "human") {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              content: "A support agent has joined the chat. You can continue the conversation here.",
            },
          ]);
        }
        return session.mode;
      });

      setSessionStatus((prev) => {
        if (prev !== "closed" && session.status === "closed") {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              content: "This conversation has been marked resolved. Start a new message anytime if you need more help.",
            },
          ]);
          setFeedbackPending(false);
        }
        return session.status;
      });
    });

    socket.on("new_message", (message: SocketMessage) => {
      if (message.sessionId !== activeSessionIdRef.current) return;
      if (message.sender !== "admin") return;

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: message.message,
        },
      ]);
      setFeedbackPending(true);
    });

    socket.on("socket_error", (payload: { message?: string } | null) => {
      console.error("Socket error:", payload?.message || "Unknown socket error");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    if (!activeSessionId) return;
    socketRef.current?.emit("join_session", { sessionId: activeSessionId });
  }, [activeSessionId]);

  const appendAssistantMessage = (content: string, service?: Service | null) => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content,
        service: service || null,
      },
    ]);
  };

  const emitUserMessage = (message: string) =>
    new Promise<{
      ok: boolean;
      sessionId?: string;
      status?: SessionStatus;
      mode?: SessionMode;
      error?: string;
    }>((resolve) => {
      const socket = socketRef.current;

      if (!socket || !socket.connected) {
        resolve({ ok: false, error: "Socket unavailable" });
        return;
      }

      let resolved = false;
      const ackTimeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        resolve({ ok: false, error: "Socket acknowledgement timeout" });
      }, 2500);

      const finish = (response: {
        ok: boolean;
        sessionId?: string;
        status?: SessionStatus;
        mode?: SessionMode;
        error?: string;
      }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(ackTimeout);
        resolve(response);
      };

      socket.emit(
        "user_message",
        {
          sessionId: activeSessionId || generatedSessionIdRef.current,
          userId: userPhone || generatedSessionIdRef.current,
          userName,
          userPhone,
          message,
        },
        (response: {
          ok: boolean;
          sessionId?: string;
          status?: SessionStatus;
          mode?: SessionMode;
          error?: string;
        }) => {
          finish(response);
        }
      );
    });

  const emitBotMessage = (sessionId: string, message: string) => {
    socketRef.current?.emit("bot_message", { sessionId, message });
  };

  const handleTalkToAgent = async () => {
    if (!profileSubmitted) {
      appendAssistantMessage(
        "Please save your name and mobile number first, then send a question so I can connect the right support flow."
      );
      return;
    }

    if (!activeSessionId) {
      appendAssistantMessage(
        "Send your question first, then I can escalate the same session to an agent."
      );
      return;
    }

    socketRef.current?.emit("request_agent_help", {
      sessionId: activeSessionId,
      reason: "User clicked Talk to agent",
    });

    setSupportRequested(true);
    setSessionStatus("escalated");
    setFeedbackPending(false);

    try {
      const res = await fetch("/api/chat/escalate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          reason: "User clicked Talk to agent",
        }),
      });

      const data = await res.json();

      if (res.ok && data?.channelName && data?.agentId && data?.agentName) {
        setEscalation({
          channelName: data.channelName,
          agentId: data.agentId,
          agentName: data.agentName,
        });
      }
    } catch (error) {
      console.error("Escalation setup error:", error);
    }

    appendAssistantMessage(
      "I’ve marked this session for agent help. You can continue here while the support flow is active."
    );
  };

  const handleHelpful = () => {
    if (!activeSessionId) return;
    socketRef.current?.emit("close_session", { sessionId: activeSessionId });
    setSessionStatus("closed");
    setFeedbackPending(false);
    appendAssistantMessage("Thanks for the feedback. I’ve marked this chat as resolved.");
  };

  const handleNotHelpful = () => {
    if (!activeSessionId) return;
    socketRef.current?.emit("request_agent_help", {
      sessionId: activeSessionId,
      reason: "User marked the agent response as not helpful",
    });
    setSessionStatus("escalated");
    setSupportRequested(true);
    setFeedbackPending(false);
    appendAssistantMessage("Understood. I’ve kept the session escalated so an agent can continue helping you.");
  };

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    if (!profileSubmitted) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Before we continue, please enter your name and phone number in the details section above and click Save Details.",
        },
      ]);
      return;
    }

    const userMsg: Message = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const persisted = await emitUserMessage(msg);
      const resolvedSessionId = persisted.sessionId || activeSessionId || generatedSessionIdRef.current;

      if (persisted.sessionId) {
        setActiveSessionId(persisted.sessionId);
      }

      if (persisted.status) {
        setSessionStatus(persisted.status);
      }

      if (persisted.mode) {
        setSessionMode(persisted.mode);
      }

      if (persisted.mode === "human") {
        return;
      }

      const isEscalationFlow = supportRequested && !!escalation;
      const shouldPreferFastResponse = supportRequested;
      const endpoint = isEscalationFlow
        ? "/api/chat/escalation/message"
        : "/api/chat";

      const body = isEscalationFlow
        ? {
            message: msg,
            channelName: escalation?.channelName,
            agentId: escalation?.agentId,
            conversation,
            currentService: conversation.currentService,
          }
        : {
            message: msg,
            conversation,
            currentService: conversation.currentService,
            preferFastResponse: shouldPreferFastResponse,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || data?.reply || "Unable to process message");
      }

      const nextConversation = data.conversation || conversation;
      const botMsg: Message = {
        role: "assistant",
        content: data.reply,
        service: data.service || nextConversation.currentService || null,
      };

      setConversation(nextConversation);
      setQuickReplies(data.quickReplies || ["Apply now"]);
      setMessages((prev) => [...prev, botMsg]);
      emitBotMessage(resolvedSessionId, data.reply);

      if (isEscalationFlow) {
        setFeedbackPending(true);
      }
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

  // Auto-scroll to the latest message whenever messages or loading state changes
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <Box
      minH="100vh"
      bg="linear-gradient(160deg, #f0f4ff 0%, #e8f5f3 50%, #f7f7fb 100%)"
      display="flex"
      alignItems={{ base: "flex-start", md: "center" }}
      justifyContent="center"
      py={{ base: 0, md: 6 }}
      px={{ base: 0, md: 4 }}
    >
      <Box
        w="100%"
        maxW="720px"
        bg="white"
        borderRadius={{ base: "none", md: "2xl" }}
        boxShadow={{ base: "none", md: "0 32px 80px rgba(15, 23, 42, 0.14)" }}
        border={{ base: "none", md: "1px solid" }}
        borderColor="gray.200"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        h={{ base: "100dvh", md: "90vh" }}
      >
        {/* ── Header ── */}
        <Box
          px={{ base: 4, md: 6 }}
          pt={{ base: 4, md: 5 }}
          pb={4}
          bg="linear-gradient(135deg, #0f766e 0%, #1e40af 100%)"
          color="white"
          flexShrink={0}
        >
          <HStack justify="space-between" align="flex-start">
            <Box>
              <Text
                fontSize={{ base: "xl", md: "2xl" }}
                fontWeight="800"
                letterSpacing="-0.5px"
                bgGradient="linear(to-r, white, #bae6fd)"
                bgClip="text"
              >
                Jaagruk Bharat
              </Text>
              <Text fontSize={{ base: "xs", md: "sm" }} opacity={0.75} mt={0.5} letterSpacing="0.3px" textTransform="uppercase" fontWeight="500">
                Your Government Services Assistant
              </Text>
            </Box>
            <HStack spacing={2} flexShrink={0} mt={1} flexWrap="wrap" justify="flex-end">
              {sessionMode === "human" && sessionStatus !== "closed" ? (
                <Badge colorScheme="purple" px={3} py={1} borderRadius="full" fontSize="xs">
                  Agent Live
                </Badge>
              ) : null}
              {isBackendSupportMode ? (
                <Badge colorScheme="orange" px={3} py={1} borderRadius="full" fontSize="xs">
                  Backend Mode
                </Badge>
              ) : null}
              {sessionStatus === "closed" ? (
                <Badge colorScheme="gray" px={3} py={1} borderRadius="full" fontSize="xs">
                  Closed
                </Badge>
              ) : null}
              <Badge bg="whiteAlpha.300" px={3} py={1} borderRadius="full" fontSize="xs">
                {conversation.stage}
              </Badge>
            </HStack>
          </HStack>

          {/* Profile form / saved chip */}
          {profileSubmitted ? (
            <HStack
              mt={3}
              px={3}
              py={2}
              bg="whiteAlpha.200"
              borderRadius="xl"
              spacing={3}
              display="inline-flex"
            >
              <Box
                w={7}
                h={7}
                borderRadius="full"
                bg="whiteAlpha.400"
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontSize="xs"
                fontWeight="700"
              >
                {userName.charAt(0).toUpperCase()}
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="700" letterSpacing="-0.2px">{userName}</Text>
                <Text fontSize="xs" opacity={0.75} letterSpacing="0.2px">{userPhone}</Text>
              </Box>
            </HStack>
          ) : (
            <Box mt={3}>
              <Text fontSize="xs" opacity={0.8} mb={2} letterSpacing="0.2px" fontWeight="500">
                Enter your details to get personalised support
              </Text>
              <HStack spacing={2} flexWrap="wrap">
                <Input
                  size="sm"
                  bg="whiteAlpha.900"
                  color="gray.800"
                  borderRadius="lg"
                  placeholder="Your Name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  _placeholder={{ color: "gray.400" }}
                  flex="1"
                  minW="120px"
                />
                <Input
                  size="sm"
                  bg="whiteAlpha.900"
                  color="gray.800"
                  borderRadius="lg"
                  placeholder="Mobile Number"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  _placeholder={{ color: "gray.400" }}
                  flex="1"
                  minW="120px"
                />
                <Button
                  size="sm"
                  bg="white"
                  color="blue.700"
                  fontWeight="700"
                  borderRadius="lg"
                  _hover={{ bg: "blue.50" }}
                  flexShrink={0}
                  onClick={() => {
                    const safeName = userName.trim();
                    const safePhone = userPhone.trim();
                    const digitsOnly = safePhone.replace(/\D/g, "");
                    const normalizedIndianPhone =
                      digitsOnly.length === 12 && digitsOnly.startsWith("91")
                        ? digitsOnly.slice(2)
                        : digitsOnly.length === 11 && digitsOnly.startsWith("0")
                          ? digitsOnly.slice(1)
                          : digitsOnly;
                    const validPhone = /^[6-9]\d{9}$/.test(normalizedIndianPhone);

                    if (!safeName || !validPhone) {
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: "assistant",
                          content:
                            "Please enter a valid Indian mobile number (10 digits, starting with 6–9).",
                        },
                      ]);
                      return;
                    }

                    setUserName(safeName);
                    setUserPhone(normalizedIndianPhone);
                    setProfileSubmitted(true);
                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `Thanks ${safeName}! Your details are saved. How can I help you today?`,
                      },
                    ]);
                  }}
                >
                  Save Details
                </Button>
              </HStack>
            </Box>
          )}
        </Box>

        {/* ── Messages ── */}
        <Box
          flex="1"
          overflowY="auto"
          px={{ base: 4, md: 6 }}
          py={4}
          bg="gray.50"
          css={{
            "&::-webkit-scrollbar": { width: "6px" },
            "&::-webkit-scrollbar-track": { background: "transparent" },
            "&::-webkit-scrollbar-thumb": { background: "#CBD5E0", borderRadius: "99px" },
          }}
        >
          <VStack spacing={3} align="stretch">
            {messages.map((msg, index) => (
              <Box
                key={`${msg.role}-${index}`}
                display="flex"
                justifyContent={msg.role === "user" ? "flex-end" : "flex-start"}
                alignItems="flex-end"
                gap={2}
              >
                {/* Bot avatar */}
                {msg.role === "assistant" && (
                  <Box
                    w={7}
                    h={7}
                    borderRadius="full"
                    bg="linear-gradient(135deg, #0f766e, #1e40af)"
                    color="white"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    fontSize="10px"
                    fontWeight="800"
                    flexShrink={0}
                    mb={0.5}
                  >
                    JB
                  </Box>
                )}

                <Box
                  maxW={{ base: "85%", md: "72%" }}
                  px={{ base: 4, md: 5 }}
                  py={{ base: 3, md: "14px" }}
                  borderRadius={msg.role === "user" ? "22px 22px 6px 22px" : "22px 22px 22px 6px"}
                  bg={msg.role === "user"
                    ? "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 55%, #0284c7 100%)"
                    : "white"}
                  color={msg.role === "user" ? "white" : "gray.800"}
                  boxShadow={msg.role === "user"
                    ? "0 4px 18px rgba(14, 165, 233, 0.38)"
                    : "0 2px 10px rgba(0, 0, 0, 0.07)"}
                  borderLeft={msg.role === "assistant" ? "3px solid" : undefined}
                  borderLeftColor={msg.role === "assistant" ? "teal.400" : undefined}
                  fontSize={{ base: "sm", md: "0.93rem" }}
                  lineHeight="1.75"
                  letterSpacing="0.01em"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => (
                        <Text mb={2} _last={{ mb: 0 }} fontWeight="400">
                          {children}
                        </Text>
                      ),
                      ol: ({ children }) => (
                        <Box as="ol" pl={5} mb={2} style={{ listStyleType: "decimal" }}>
                          {children}
                        </Box>
                      ),
                      ul: ({ children }) => (
                        <Box as="ul" pl={5} mb={2} style={{ listStyleType: "disc" }}>
                          {children}
                        </Box>
                      ),
                      li: ({ children }) => (
                        <Box as="li" mb={0.5}>
                          {children}
                        </Box>
                      ),
                      a: (props) => (
                        <a
                          {...props}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: msg.role === "user" ? "#bfdbfe" : "#1d4ed8",
                            fontWeight: 600,
                            textDecoration: "underline",
                          }}
                        />
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </Box>
              </Box>
            ))}

            {/* Typing indicator */}
            {loading && (
              <Box display="flex" alignItems="flex-end" gap={2}>
                <Box
                  w={7}
                  h={7}
                  borderRadius="full"
                  bg="linear-gradient(135deg, #0f766e, #1e40af)"
                  color="white"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  fontSize="10px"
                  fontWeight="800"
                  flexShrink={0}
                >
                  JB
                </Box>
                <Box
                  px={{ base: 4, md: 5 }}
                  py={{ base: 3, md: "14px" }}
                  bg="white"
                  borderRadius="22px 22px 22px 6px"
                  boxShadow="0 2px 10px rgba(0,0,0,0.07)"
                  borderLeft="3px solid"
                  borderLeftColor="teal.400"
                >
                  <HStack spacing={2}>
                    <Spinner size="xs" color="teal.500" />
                    <Text fontSize="xs" color="gray.400" fontStyle="italic" letterSpacing="0.3px">Preparing your answer…</Text>
                  </HStack>
                </Box>
              </Box>
            )}

            {/* Scroll sentinel — always kept at the end */}
            <div ref={chatScrollRef} />
          </VStack>
        </Box>

        <Box px={{ base: 4, md: 6 }} pt={3} bg="white" flexShrink={0}>
          <HStack spacing={2} wrap="wrap">
            <Badge colorScheme={sessionMode === "human" ? "purple" : sessionStatus === "escalated" ? "red" : sessionStatus === "closed" ? "gray" : "green"} px={3} py={1} borderRadius="full">
              {sessionMode === "human"
                ? "Human support"
                : sessionStatus === "escalated"
                  ? "Escalated"
                  : sessionStatus === "closed"
                    ? "Closed"
                    : "Active"}
            </Badge>
            <Button
              size="sm"
              borderRadius="full"
              colorScheme="orange"
              variant="outline"
              onClick={handleTalkToAgent}
              isDisabled={loading || !profileSubmitted || sessionStatus === "closed"}
            >
              Talk to agent
            </Button>
            {escalation?.agentName ? (
              <Badge colorScheme="purple" px={3} py={1} borderRadius="full">
                {escalation.agentName}
              </Badge>
            ) : null}
          </HStack>

          {feedbackPending ? (
            <HStack spacing={2} mt={3} wrap="wrap">
              <Button size="sm" colorScheme="green" borderRadius="full" onClick={handleHelpful}>
                Helpful
              </Button>
              <Button size="sm" colorScheme="red" variant="outline" borderRadius="full" onClick={handleNotHelpful}>
                Not helpful
              </Button>
            </HStack>
          ) : null}
        </Box>

        {/* ── Quick replies ── */}
        <Box
          px={{ base: 4, md: 6 }}
          pt={3}
          pb={2}
          bg="white"
          borderTop="1px solid"
          borderColor="gray.100"
          flexShrink={0}
        >
          <HStack spacing={2} wrap="wrap">
            {quickReplies.map((reply) => (
              <Button
                key={reply}
                size="sm"
                borderRadius="full"
                bg="blue.50"
                color="blue.700"
                border="1.5px solid"
                borderColor="blue.200"
                _hover={{ bg: "blue.50", borderColor: "blue.400", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(14,165,233,0.2)" }}
                _active={{ transform: "translateY(0px)", boxShadow: "none" }}
                transition="all 0.15s ease"
                onClick={() => handleSend(reply)}
                isDisabled={loading || sessionStatus === "closed"}
                whiteSpace="normal"
                h="auto"
                minH="30px"
                py={1}
                px={4}
                fontSize="xs"
                fontWeight="600"
                letterSpacing="0.2px"
              >
                {reply}
              </Button>
            ))}
          </HStack>
        </Box>

        {/* ── Input bar ── */}
        <Box
          px={{ base: 4, md: 6 }}
          py={3}
          bg="white"
          borderTop="1px solid"
          borderColor="gray.100"
          flexShrink={0}
        >
          <HStack
            bg="gray.50"
            borderRadius="2xl"
            border="2px solid"
            borderColor="gray.200"
            px={4}
            py={2}
            _focusWithin={{ borderColor: "blue.400", bg: "white", boxShadow: "0 0 0 3px rgba(59,130,246,0.15)" }}
            transition="all 0.15s"
          >
            <Input
              variant="unstyled"
              placeholder={profileSubmitted ? "Ask me anything about a government service…" : "Save your details above to start"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              isDisabled={!profileSubmitted || sessionStatus === "closed"}
              fontSize="sm"
              fontWeight="450"
              letterSpacing="0.01em"
              _placeholder={{ color: "gray.400", fontStyle: "italic" }}
            />
            <IconButton
              aria-label="Send message"
              icon={<Send size={16} />}
              colorScheme="blue"
              borderRadius="xl"
              size="sm"
              onClick={() => handleSend()}
              isLoading={loading}
              isDisabled={!profileSubmitted || !input.trim() || sessionStatus === "closed"}
              flexShrink={0}
            />
          </HStack>
        </Box>
      </Box>
    </Box>
  );
}
