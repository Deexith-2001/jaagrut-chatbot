"use client";

import dynamic from "next/dynamic";
import { Box, Spinner, Center } from "@chakra-ui/react";

const ChatInterface = dynamic(
  () => import("../../components/ChatInterface"),
  {
    ssr: false,
    loading: () => (
      <Center h="100vh" w="100vw">
        <Spinner size="xl" color="blue.500" />
      </Center>
    ),
  }
);

export default function Page() {
  return (
    <Box bg="gray.100" minH="100vh">
      <ChatInterface />
    </Box>
  );
}