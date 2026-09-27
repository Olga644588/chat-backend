import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import cors from "cors";
import pino from "pino";
import WebSocket, { WebSocketServer } from "ws";

const app = express();
const logger = pino();

app.use(cors());
app.use(express.json());

const userState = [];

app.post("/new-user", (request, response) => {
  const { name } = request.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    logger.error("Empty or invalid name received");
    return response.status(400).json({
      status: "error",
      message: "Name is required",
    });
  }

  const isExist = userState.find((user) => user.name === name);
  if (isExist) {
    logger.error(`User with name "${name}" already exists`);
    return response.status(409).json({
      status: "error",
      message: "This name is already taken!",
    });
  }

  const newUser = {
    id: randomUUID(),
    name: name.trim(),
  };
  userState.push(newUser);

  logger.info(`New user created: ${newUser.name} (${newUser.id})`);
  return response.json({
    status: "ok",
    user: newUser,
  });
});

const server = http.createServer(app);
const wsServer = new WebSocketServer({ server });

wsServer.on("connection", (ws) => {
  ws.send(JSON.stringify(userState));

  ws.on("message", (msg, isBinary) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      logger.warn("Invalid JSON message received");
      return;
    }

    if (data.type === "exit" && data.user?.name) {
      const idx = userState.findIndex((u) => u.name === data.user.name);
      if (idx !== -1) {
        userState.splice(idx, 1);
        logger.info(`User "${data.user.name}" removed from state`);
      }
      [...wsServer.clients]
        .filter((c) => c.readyState === WebSocket.OPEN)
        .forEach((c) => c.send(JSON.stringify(userState)));
      return;
    }

    if (data.type === "send" && data.message !== undefined) {
      [...wsServer.clients]
        .filter((c) => c.readyState === WebSocket.OPEN)
        .forEach((c) => c.send(msg, { binary: isBinary }));
      logger.info("Message broadcasted to all clients");
      return;
    }
  });

  ws.on("close", () => {
    logger.info("WebSocket client disconnected");
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  logger.info(`Server started on port ${port}`);
});
