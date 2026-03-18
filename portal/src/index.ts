import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import apiRoutes from "./routes/api.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj: Express.User, done) => done(null, obj));

if (config.github.clientID) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: config.github.clientID,
        clientSecret: config.github.clientSecret,
        callbackURL: config.github.callbackURL,
      },
      (_accessToken: string, _refreshToken: string, profile: object, done: Function) => {
        done(null, profile);
      }
    )
  );
}

app.use(passport.initialize());
app.use(passport.session());

app.get("/healthz", (_req, res) => { res.json({ ok: true }); });
app.use("/auth", authRoutes);
app.use("/api", apiRoutes);

// Serve static frontend in production
const publicDir = path.join(__dirname, "..", "..", "public");
app.use(express.static(publicDir));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`Portal listening on port ${config.port}`);
});
