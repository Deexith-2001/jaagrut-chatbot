"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { io, Socket } from "socket.io-client";

type Session = {
  id: string;
  userId: string;
  userName?: string | null;
  userPhone?: string | null;
  status: "active" | "escalated" | "closed";
  mode: "bot" | "human";
  createdAt: string;
  messages?: Array<{ message: string; timestamp: string }>;
};

type ChatMessage = {
  id: string;
  sessionId: string;
  sender: "user" | "bot" | "admin";
  message: string;
  timestamp: string;
};

function upsertSession(prev: Session[], session: Session) {
  return [session, ...prev.filter((item) => item.id !== session.id)];
}

function uniqueMessagesById(items: ChatMessage[]) {
  const seen = new Set<string>();
  const result: ChatMessage[] = [];

  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

export default function AdminDashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const selectedSessionIdRef = useRef<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const socketUrl = useMemo(
    () => process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4001",
    []
  );

  // Persistent admin socket connection
  useEffect(() => {
    const socket: Socket = io(socketUrl, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.emit("admin_join");

    socket.on("session_list", (incoming: Session[]) => {
      setSessions(incoming || []);
    });

    socket.on("session_updated", (session: Session) => {
      setSessions((prev) => upsertSession(prev, session));
    });

    socket.on("session_escalated", ({ sessionId }: { sessionId: string }) => {
      setSessions((prev) => {
        const existing = prev.find((session) => session.id === sessionId);
        if (!existing) return prev;
        return upsertSession(prev, { ...existing, status: "escalated" });
      });
    });

    socket.on("new_message", (message: ChatMessage) => {
      if (message.sessionId === selectedSessionIdRef.current) {
        setMessages((prev) => uniqueMessagesById([...prev, message]));
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl]);

  // Load message history when session changes
  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;

    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    socketRef.current?.emit("join_session", { sessionId: selectedSessionId });

    const fetchHistory = async () => {
      setLoadingMessages(true);

      try {
        const res = await fetch(`/api/sessions/${selectedSessionId}/messages`, {
          cache: "no-store",
        });
        const data = await res.json();
        setMessages(uniqueMessagesById(data?.messages || []));
      } catch (error) {
        console.error("Failed to fetch session messages:", error);
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchHistory();
  }, [selectedSessionId]);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, selectedSessionId]);

  const selectedSession =
    sessions.find((s) => s.id === selectedSessionId) || null;

  const handleTakeOver = () => {
    if (!selectedSessionId || !socketRef.current) return;
    socketRef.current.emit("takeover_chat", { sessionId: selectedSessionId });
  };

  const handleSendReply = () => {
    const trimmed = reply.trim();
    if (!selectedSessionId || !trimmed || !socketRef.current) return;
    socketRef.current.emit("admin_reply", {
      sessionId: selectedSessionId,
      message: trimmed,
    });
    setReply("");
  };

  return (
    <Flex h="100vh" bg="gray.50" overflow="hidden">
      {/* Sidebar – session list */}
      <Box
        w={{ base: "100%", md: "360px" }}
        h="100vh"
        borderRightWidth="1px"
        bg="white"
        p={4}
        overflowY="auto"
      >
        <Text fontSize="xl" fontWeight="bold" mb={4}>
          Sessions
        </Text>
        <VStack spacing={3} align="stretch">
          {sessions.map((session) => (
            <Box
              key={session.id}
              p={3}
              borderWidth="1px"
              borderRadius="lg"
              cursor="pointer"
              bg={
                session.status === "escalated"
                  ? selectedSessionId === session.id
                    ? "red.50"
                    : "#fff5f5"
                  : session.status === "closed"
                  ? selectedSessionId === session.id
                    ? "gray.100"
                    : "gray.50"
                  : selectedSessionId === session.id
                  ? "blue.50"
                  : "white"
              }
              borderColor={
                session.status === "escalated"
                  ? "red.400"
                  : session.status === "closed"
                  ? "gray.300"
                  : "gray.200"
              }
              boxShadow={session.status === "escalated" ? "0 0 0 1px rgba(248, 113, 113, 0.16)" : "none"}
              onClick={() => setSelectedSessionId(session.id)}
            >
              <HStack justify="space-between" mb={1}>
                <Text fontWeight="semibold" fontSize="sm" isTruncated>
                  {session.userName || "Unknown User"}
                </Text>
                <Badge
                  colorScheme={
                    session.mode === "human"
                      ? "purple"
                      : session.status === "escalated"
                      ? "red"
                      : session.status === "closed"
                      ? "gray"
                      : "green"
                  }
                  fontSize="xs"
                >
                  {session.mode === "human"
                    ? "human"
                    : session.status === "escalated"
                    ? "needs help"
                    : session.status === "closed"
                    ? "closed"
                    : "active"}
                </Badge>
              </HStack>
              <Text fontSize="xs" color="gray.400" isTruncated>
                {session.userPhone || "No phone"}
              </Text>
              <Text fontSize="xs" color="gray.500" isTruncated>
                {new Date(session.createdAt).toLocaleString()}
              </Text>
              {session.status === "escalated" && (
                <Badge mt={2} colorScheme="red" fontSize="xs">
                  Needs Attention
                </Badge>
              )}
              {session.status === "closed" && (
                <Badge mt={2} colorScheme="gray" fontSize="xs">
                  Closed
                </Badge>
              )}
            </Box>
          ))}
          {sessions.length === 0 && (
            <Text color="gray.400" fontSize="sm">
              No active sessions yet.
            </Text>
          )}
        </VStack>
      </Box>

      {/* Main chat window */}
      <Flex flex="1" h="100vh" direction="column" p={4}>
        <HStack justify="space-between" mb={4}>
          <Box>
            <Text fontSize="lg" fontWeight="bold">
              {selectedSession
                ? `Chat: ${selectedSession.userName || selectedSession.userId}`
                : "Select a session"}
            </Text>
            {selectedSession && (
              <Text color="gray.500" fontSize="xs">
                {selectedSession.userPhone || "No phone"} &middot; {new Date(selectedSession.createdAt).toLocaleString()} &middot;{" "}
                <Badge
                  colorScheme={
                    selectedSession.status === "escalated"
                      ? "red"
                      : selectedSession.status === "closed"
                      ? "gray"
                      : "green"
                  }
                >
                  {selectedSession.status === "escalated"
                    ? "needs attention"
                    : selectedSession.status}
                </Badge>
              </Text>
            )}
          </Box>
          <Button
            colorScheme="orange"
            size="sm"
            onClick={handleTakeOver}
            isDisabled={
              !selectedSessionId || selectedSession?.mode === "human"
            }
          >
            {selectedSession?.mode === "human" ? "Human mode" : "Take Over"}
          </Button>
        </HStack>

        {selectedSession?.status === "escalated" ? (
          <Box
            mb={4}
            px={4}
            py={3}
            borderRadius="xl"
            bg="red.50"
            borderWidth="1px"
            borderColor="red.200"
          >
            <Text fontSize="sm" fontWeight="700" color="red.700">
              User asked for agent help (Talk to agent / Not helpful).
            </Text>
            <Text fontSize="xs" color="red.600" mt={1}>
              Review the conversation and use Take Over when your team is ready to respond.
            </Text>
          </Box>
        ) : null}

        {/* Message thread */}
        <Box
          ref={chatScrollRef}
          flex="1"
          borderWidth="1px"
          borderRadius="xl"
          bg="white"
          p={4}
          overflowY="auto"
          minH="0"
        >
          <VStack align="stretch" spacing={3}>
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              const isAdmin = msg.sender === "admin";
              const isSupportRequestNote = msg.message.startsWith("[Support requested]");

              return (
                <Flex key={msg.id} justify={isUser ? "flex-end" : "flex-start"}>
                  <Box
                    maxW="70%"
                    px={4}
                    py={2}
                    borderRadius="xl"
                    bg={
                      isSupportRequestNote
                        ? "red.50"
                        : isUser
                        ? "blue.500"
                        : isAdmin
                        ? "purple.100"
                        : "gray.100"
                    }
                    color={isUser ? "white" : isSupportRequestNote ? "red.700" : "gray.800"}
                    borderWidth={isAdmin || isSupportRequestNote ? "1px" : "0"}
                    borderColor={isSupportRequestNote ? "red.300" : isAdmin ? "purple.300" : "transparent"}
                  >
                    <Text
                      fontSize="xs"
                      mb={1}
                      textTransform="uppercase"
                      opacity={0.7}
                      fontWeight="bold"
                    >
                      {isSupportRequestNote ? "support alert" : msg.sender}
                    </Text>
                    <Text whiteSpace="pre-wrap" fontSize="sm">
                      {msg.message}
                    </Text>
                  </Box>
                </Flex>
              );
            })}
            {!loadingMessages && messages.length === 0 && (
              <Text color="gray.400" fontSize="sm">
                No messages found for this session.
              </Text>
            )}
            {loadingMessages && (
              <Text color="gray.400" fontSize="sm">
                Loading messages...
              </Text>
            )}
          </VStack>
        </Box>

        {/* Reply input */}
        <HStack mt={4}>
          <Input
            placeholder={
              selectedSession?.mode === "human"
                ? "Type admin reply…"
                : "Take over first to reply…"
            }
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendReply();
            }}
            isDisabled={!selectedSessionId || selectedSession?.mode !== "human"}
          />
          <Button
            colorScheme="blue"
            onClick={handleSendReply}
            isDisabled={
              !selectedSessionId || selectedSession?.mode !== "human"
            }
          >
            Send
          </Button>
        </HStack>
      </Flex>
    </Flex>
  );
}
