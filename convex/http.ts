import { httpRouter } from "convex/server";
import { start, callback } from "./bankAuth";

const http = httpRouter();

http.route({ path: "/api/auth/start", method: "GET", handler: start });
http.route({ path: "/api/auth/callback", method: "GET", handler: callback });

export default http;
