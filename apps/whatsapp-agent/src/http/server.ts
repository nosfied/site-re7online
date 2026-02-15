import http from "node:http";
import { handleRequest } from "./routes.js";

export function createServer() {
  return http.createServer((req, res) => {
    void handleRequest(req, res);
  });
}
