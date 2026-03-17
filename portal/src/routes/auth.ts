import { Router } from "express";
import passport from "passport";

const router = Router();

router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));

router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/" }),
  (_req, res) => {
    res.redirect("/");
  }
);

router.get("/me", (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user as { username: string; displayName: string; photos: { value: string }[] };
    res.json({
      username: user.username,
      displayName: user.displayName,
      avatar: user.photos?.[0]?.value ?? "",
    });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

router.post("/logout", (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

export default router;
