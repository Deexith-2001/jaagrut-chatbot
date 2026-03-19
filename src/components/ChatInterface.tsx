"use client";
import { useState, useEffect, useRef } from "react";
import {
  Box,
  VStack,
  HStack,
  Input,
  IconButton,
  Text,
  Container,
  Flex,
  Avatar,
  Spinner,
  Button,
  useColorModeValue
} from "@chakra-ui/react";
import { Link } from "@chakra-ui/react";
import { Send, Bot, User, Circle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Service = {
  name: string;
  link: string;
  price?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  services?: Service[];
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I'm your **Jaagruk Bharat Assistant**. Ask me about PAN, Passport, or other services."
    }
  ]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const uBubble = useColorModeValue("blue.600", "blue.500");
  const aBubble = useColorModeValue("gray.50", "gray.700");
  const aiTextColor = useColorModeValue("black", "white");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (msg?: string) => {
    const text = msg || input;
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            content: m.content
          }))
        })
      });

      const data = await res.json();

      const botMessage: Message = {
        role: "assistant",
        content: data.text || data.reply || "",
        services: data.services || []
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Connection error. Please try again." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxW={["full", "container.md"]} h={["100vh", "85vh"]} p={0} shadow="2xl" mt={[0, "5vh"]}>
      <VStack h="full" spacing={0} bg="white" borderRadius={[0, "2xl"]} overflow="hidden" border="1px" borderColor="gray.100">
        
        {/* Header */}
        <HStack w="full" p={4} bg="blue.600" color="white" justify="space-between" shadow="md">
          <HStack spacing={3}>
            <Avatar size="sm" icon={<Bot size={20} />} bg="white" color="blue.600" />
            <Box>
              <Text fontWeight="bold" fontSize={["sm", "md"]}>Jaagruk Bharat AI</Text>
              <HStack spacing={1}>
                <Circle size={8} fill="green.400" color="green.400" />
                <Text fontSize="xs">Active Now</Text>
              </HStack>
            </Box>
          </HStack>
        </HStack>

        {/* Chat Messages */}
        <Box flex={1} w="full" overflowY="auto" p={4} ref={scrollRef} bg="gray.50">
          <VStack spacing={5} align="stretch">
            {messages.map((m, i) => (
              <Flex key={i} justify={m.role === "user" ? "flex-end" : "flex-start"}>
                <HStack align="start" spacing={3} maxW="85%" flexDir={m.role === "user" ? "row-reverse" : "row"}>
                  <Avatar size="xs" icon={m.role === "user" ? <User size={14} /> : <Bot size={14} />} />
                  
                  <Box
                    p={3}
                    bg={m.role === "user" ? uBubble : aBubble}
                    color={m.role === "user" ? "white" : aiTextColor}
                    borderRadius="2xl"
                    shadow="sm"
                    borderTopRightRadius={m.role === "user" ? 0 : "2xl"}
                    borderTopLeftRadius={m.role === "assistant" ? 0 : "2xl"}
                  >
                    {/* Message Text */}
                    <Box sx={{ "& p": { mb: 0 } }} pointerEvents="auto">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ node, ...props }) => (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#3182ce", textDecoration: "underline" }}
                            />
                          )
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </Box>

                    {/* 🔥 Services Section */}
                    {m.services && m.services.length > 0 && (
                      <VStack align="start" mt={3} spacing={2}>
                        <Text fontWeight="bold" fontSize="sm">
                          Available Services:
                        </Text>

                        {m.services.map((s, i) => (
                          <Box
                            key={i}
                            p={2}
                            bg="white"
                            borderWidth="1px"
                            borderRadius="md"
                            w="100%"
                            pointerEvents="auto"
                          >
                            <Text fontWeight="semibold" fontSize="sm">
                              {i + 1}. {s.name}
                            </Text>

                            {s.price && (
                              <Text fontSize="xs">💰 {s.price}</Text>
                            )}

                            <Link
                              href={s.link?.trim()}
                              isExternal
                              color="blue.600"
                              fontSize="sm"
                              fontWeight="medium"
                              _hover={{ textDecoration: "underline" }}
                              display="inline-block"
                              cursor="pointer">
                              Open Service →
                            </Link>
                          </Box>
                        ))}
                      </VStack>
                    )}
                  </Box>
                </HStack>
              </Flex>
            ))}

            {isLoading && (
              <HStack spacing={2} p={2} color="gray.400">
                <Spinner size="xs" />
                <Text fontSize="xs" fontStyle="italic">
                  Searching database...
                </Text>
              </HStack>
            )}
          </VStack>
        </Box>

        {/* Footer */}
        <Box w="full" p={4} bg="white" borderTop="1px" borderColor="gray.100">
          <HStack spacing={2} mb={3} overflowX="auto" pb={1}>
            {["PAN Help", "Passport Fee", "Support"].map((c) => (
              <Button
                key={c}
                size="xs"
                variant="outline"
                borderRadius="full"
                colorScheme="blue"
                onClick={() => handleSend(c)}
                disabled={isLoading}
              >
                {c}
              </Button>
            ))}
          </HStack>

          <HStack spacing={3}>
            <Input
              variant="filled"
              placeholder="Ask about services..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              borderRadius="full"
              bg="gray.100"
              _focus={{ bg: "white", borderColor: "blue.500" }}
            />

            <IconButton
              aria-label="send"
              icon={<Send size={20} />}
              colorScheme="blue"
              borderRadius="full"
              onClick={() => handleSend()}
              isLoading={isLoading}
            />
          </HStack>
        </Box>
      </VStack>
    </Container>
  );
}