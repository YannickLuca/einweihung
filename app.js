/* =========================================================
   Einweihungsparty · Logik
   Login → Einladung → Anmeldung → Snack-Liste (live)
   ========================================================= */
(function () {
  "use strict";

  const CONFIG = window.PARTY_CONFIG || {};
  const PARTY_DAY = new Date(2026, 11, 5); // 5. Dezember 2026 (Monate zählen ab 0)
  const POLL_MS = 20000; // Sicherheitsnetz, falls die Live-Verbindung abreisst
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (selector) => document.querySelector(selector);
  const tidy = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const sameText = (a, b) => tidy(a, 200).toLowerCase() === tidy(b, 200).toLowerCase();
  const clampPersons = (value) => Math.min(10, Math.max(1, parseInt(value, 10) || 1));

  /* ---------------------------------------------------------
     Kleiner Speicher im Browser: Name, eigene Snacks, Adresse.
     Darf fehlen (z. B. im privaten Modus) – dann eben ohne.
     --------------------------------------------------------- */
  const memory = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem("party." + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("party." + key, JSON.stringify(value));
      } catch {}
    },
    clear() {
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith("party."))
          .forEach((key) => localStorage.removeItem(key));
      } catch {}
    },
  };

  /* ---------------------------------------------------------
     Verbindung zur Datenbank
     --------------------------------------------------------- */
  const configured =
    /^https:\/\//.test(CONFIG.supabaseUrl || "") && !/^HIER-/.test(CONFIG.supabaseKey || "HIER-");

  function supabaseBackend() {
    const db = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
    const check = (error) => {
      if (error) throw error;
    };

    return {
      async hasSession() {
        const { data } = await db.auth.getSession();
        return Boolean(data && data.session);
      },
      async login(password) {
        const { error } = await db.auth.signInWithPassword({ email: CONFIG.guestEmail, password });
        if (error) throw loginProblem(error);
      },
      async logout() {
        // Nur DIESES Gerät abmelden – alle Gäste teilen sich ein Konto!
        await db.auth.signOut({ scope: "local" });
      },
      onSignedOut(callback) {
        db.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT") callback();
        });
      },
      async info() {
        const { data, error } = await db.from("party_info").select("address, note").limit(1).maybeSingle();
        check(error);
        return data;
      },
      async surprise() {
        // Eigene Abfrage: Fehlt die Spalte noch, bleibt nur die Überraschung weg – nicht die Adresse.
        const { data, error } = await db.from("party_info").select("surprise").limit(1).maybeSingle();
        return error ? null : (data && data.surprise) || "";
      },
      async snacks() {
        const { data, error } = await db.from("snacks").select("id, name, claimed_at").order("id");
        check(error);
        return data || [];
      },
      async rsvp(entry) {
        const { error } = await db.from("guests").insert(entry);
        check(error);
      },
      async claim(id, guestName) {
        const { data, error } = await db.rpc("claim_snack", { snack_id: id, guest_name: guestName });
        check(error);
        return data === true;
      },
      async add(snackName, guestName) {
        const { data, error } = await db.rpc("add_snack", { snack_name: snackName, guest_name: guestName });
        check(error);
        return data;
      },
      live(onChange) {
        db.channel("snacks-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "snacks" }, onChange)
          .subscribe();
      },
    };
  }

  // Vorschau ohne Datenbank – läuft, solange config.js noch Platzhalter enthält.
  function previewBackend() {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const list = ["Chips", "Lebkuchen", "Mandarinen", "Käse & Cracker", "Guetzli"].map((name, i) => ({
      id: i + 1,
      name,
      claimed_at: null,
    }));
    let session = location.hash === "#vorschau";

    return {
      preview: true,
      async hasSession() {
        return session;
      },
      async login() {
        await wait(400);
        session = true;
      },
      async logout() {
        session = false;
      },
      onSignedOut() {},
      async info() {
        await wait(300);
        return { address: "Musterstrasse 1, 8000 Zürich", note: "Vorschau – hier steht später eure Adresse aus Supabase." };
      },
      async surprise() {
        await wait(300);
        return "Hier steht eure Überraschung\nDen Text tragt ihr in Supabase ein: Tabelle party_info, Feld surprise. Die erste Zeile wird zur Überschrift.";
      },
      async snacks() {
        await wait(200);
        return list.map((snack) => ({ ...snack }));
      },
      async rsvp() {
        await wait(400);
      },
      async claim(id) {
        await wait(400);
        const snack = list.find((s) => s.id === id);
        if (!snack || snack.claimed_at) return false;
        snack.claimed_at = new Date().toISOString();
        return true;
      },
      async add(name) {
        await wait(400);
        const id = list.length + 1;
        list.push({ id, name, claimed_at: new Date().toISOString() });
        return id;
      },
      live() {},
    };
  }

  const backend = !configured ? previewBackend() : window.supabase ? supabaseBackend() : null;

  function loginProblem(error) {
    if (error.status === 429 || error.code === "over_request_rate_limit") return new Error("rate");
    if (error.status === 400 || error.code === "invalid_credentials") return new Error("wrong");
    return new Error("offline");
  }

  // Abgelaufene oder fehlende Anmeldung: Die Datenbank antwortet dann mit "permission denied" o. ä.
  function isLoginError(error) {
    const code = (error && error.code) || "";
    return code === "42501" || code === "PGRST301" || /jwt/i.test((error && error.message) || "");
  }

  function problem(error, text) {
    console.error(error);
    if (isLoginError(error)) {
      if (loggedIn()) {
        toast("Dein Schlüssel ist abgelaufen – gib den Code bitte nochmal ein.", "error");
        showLogin();
      }
    } else if (!navigator.onLine) {
      toast("Keine Internetverbindung. Versuch es gleich nochmal.", "error");
    } else {
      toast(text || "Hoppla, das hat nicht geklappt. Versuch es bitte nochmal.", "error");
    }
  }

  /* ---------------------------------------------------------
     Kleine Meldungen unten am Bildschirm
     --------------------------------------------------------- */
  function toast(text, type = "ok") {
    const box = $("#toasts");
    while (box.children.length >= 3) box.firstElementChild.remove();

    const el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.textContent = text;
    box.append(el);

    const close = () => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 300);
    };
    const timer = setTimeout(close, type === "error" ? 6500 : 4200);
    el.addEventListener("click", () => {
      clearTimeout(timer);
      close();
    });
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle("busy", busy);
  }

  /* ---------------------------------------------------------
     Login
     --------------------------------------------------------- */
  const loggedIn = () => document.body.classList.contains("is-in");

  function showLogin() {
    document.body.classList.remove("is-in");
    $("#invite").hidden = true;
    $("#logout").hidden = true;
    const card = $("#login");
    card.hidden = false;
    card.classList.remove("fade-out");
  }

  async function handleLogin(event) {
    event.preventDefault();
    const input = $("#password");
    const button = $("#login-form [type=submit]");
    if (!input.value) {
      toast("Bitte gib den Code aus unserer Nachricht ein.", "error");
      input.focus();
      return;
    }

    setBusy(button, true);
    try {
      await backend.login(input.value);
      input.value = "";
      input.blur();
      await unlockAnimation();
      enterInvite(true);
      if (backend.preview) toast("Vorschau-Modus: Es wird nichts gespeichert.", "info");
    } catch (error) {
      shake($("#login"));
      const reason = error && error.message;
      if (reason === "wrong") toast("Hmm, dieser Schlüssel passt nicht. Versuch's nochmal.", "error");
      else if (reason === "rate") toast("Zu viele Versuche. Warte ein paar Minuten und probier es dann nochmal.", "error");
      else toast("Die Tür antwortet nicht. Bist du online?", "error");
    } finally {
      setBusy(button, false);
    }
  }

  function unlockAnimation() {
    if (reduceMotion) return Promise.resolve();
    document.body.classList.add("unlocking");
    $("#login").classList.add("fade-out");
    return new Promise((resolve) =>
      setTimeout(() => {
        document.body.classList.remove("unlocking");
        resolve();
      }, 1150)
    );
  }

  function shake(element) {
    element.classList.remove("shake");
    void element.offsetWidth; // Animation neu starten
    element.classList.add("shake");
  }

  function togglePassword() {
    const input = $("#password");
    const button = $("#pw-toggle");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "verbergen" : "zeigen";
    button.setAttribute("aria-pressed", String(show));
  }

  async function handleLogout() {
    document.body.classList.remove("is-in");
    try {
      await backend.logout();
    } catch {}
    memory.clear();
    location.replace(location.pathname + location.search);
  }

  /* ---------------------------------------------------------
     Einladung
     --------------------------------------------------------- */
  let watching = false;

  function enterInvite(animate) {
    $("#login").hidden = true;
    const invite = $("#invite");
    invite.hidden = false;
    invite.classList.toggle("fade-in", animate && !reduceMotion);
    $("#logout").hidden = false;
    document.body.classList.add("is-in");

    renderCountdown();
    showRsvpState();
    loadInfo();
    loadSurprise();
    refreshSnacks();

    if (!watching) {
      watching = true;
      backend.live(scheduleRefresh);
      setInterval(() => {
        if (!document.hidden) refreshSnacks();
      }, POLL_MS);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshSnacks();
      });
    }
  }

  function renderCountdown() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((PARTY_DAY - today) / 86400000);
    $("#countdown").textContent =
      days > 1 ? "Noch " + days + " Tage" : days === 1 ? "Morgen!" : days === 0 ? "Heute ab 16 Uhr" : "Danke fürs Kommen";
  }

  async function loadInfo() {
    const cached = memory.get("info", null);
    if (cached) showInfo(cached);
    try {
      const info = (await backend.info()) || { address: "Adresse folgt" };
      showInfo(info);
      if (!backend.preview) memory.set("info", info);
    } catch (error) {
      if (isLoginError(error)) return problem(error);
      console.error(error);
      if (!cached) $("#address").textContent = "Konnte nicht geladen werden – lade die Seite bitte neu.";
    }
  }

  function showInfo(info) {
    const address = tidy(info.address, 300);
    const box = $("#address");
    box.textContent = "";
    address.split(/\s*,\s*/).forEach((line, i) => {
      if (i) box.append(document.createElement("br"));
      box.append(line);
    });

    const note = $("#address-note");
    note.textContent = tidy(info.note, 300);
    note.hidden = !note.textContent;

    const route = $("#route");
    route.hidden = !address || address === "Adresse folgt";
    route.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
  }

  /* ---------------------------------------------------------
     "Psst … noch etwas" – Text aus Supabase, erste Zeile = Überschrift
     --------------------------------------------------------- */
  async function loadSurprise() {
    const cached = memory.get("surprise", "");
    if (cached) showSurprise(cached);
    const text = await backend.surprise(); // null = gerade nicht ladbar → so lassen
    if (text === null) return;
    showSurprise(text);
    if (!backend.preview) memory.set("surprise", text);
  }

  function showSurprise(text) {
    const [head, ...rest] = String(text || "").split("\n");
    $("#surprise-head").textContent = tidy(head, 120);
    $("#surprise-text").textContent = tidy(rest.join(" "), 500);
    $("#surprise-text").hidden = !$("#surprise-text").textContent;
    $("#surprise").hidden = !$("#surprise-head").textContent;
  }

  let jingleTimer = 0;

  function jingle() {
    const ring = $("#keyring");
    ring.classList.remove("jingle");
    void ring.offsetWidth; // Animation neu starten
    ring.classList.add("jingle");
    clearTimeout(jingleTimer);
    jingleTimer = setTimeout(() => ring.classList.remove("jingle"), 1000);
    if (reduceMotion || !ring.animate) return;

    const card = $("#surprise");
    const from = ring.getBoundingClientRect();
    const base = card.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      heart.setAttribute("viewBox", "0 0 24 24");
      heart.setAttribute("class", "heart");
      heart.innerHTML =
        '<path d="M12 21C5 16 2 12.5 2 8.5 2 5.4 4.4 3 7.4 3c1.9 0 3.6 1 4.6 2.6C13 4 14.7 3 16.6 3 19.6 3 22 5.4 22 8.5c0 4-3 7.5-10 12.5Z"/>';
      heart.style.left = from.left - base.left + from.width / 2 - 9 + "px";
      heart.style.top = from.top - base.top + from.height * 0.6 + "px";
      card.append(heart);

      const dx = (Math.random() - 0.5) * 150;
      const dy = -(70 + Math.random() * 90);
      const size = 0.6 + Math.random() * 0.7;
      heart
        .animate(
          [
            { transform: "translate(0, 0) scale(0.3)", opacity: 0 },
            { transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(${size})`, opacity: 1, offset: 0.25 },
            { transform: `translate(${dx}px, ${dy}px) scale(${size * 0.8})`, opacity: 0 },
          ],
          { duration: 1400 + Math.random() * 600, delay: i * 60, easing: "cubic-bezier(.2, .7, .3, 1)", fill: "both" }
        )
        .finished.then(() => heart.remove(), () => heart.remove());
      setTimeout(() => heart.remove(), 2800);
    }
  }

  /* ---------------------------------------------------------
     Anmeldung
     --------------------------------------------------------- */
  function showRsvpState() {
    const saved = memory.get("rsvp", null);
    $("#rsvp-form").hidden = Boolean(saved);
    $("#rsvp-done").hidden = !saved;
    if (saved) {
      $("#rsvp-done-name").textContent = ", " + saved.name;
      $("#rsvp-done-text").textContent =
        saved.persons > 1
          ? "Wir freuen uns auf euch – " + saved.persons + " Personen sind notiert."
          : "Wir freuen uns auf dich!";
    } else if (!$("#rsvp-name").value) {
      $("#rsvp-name").value = memory.get("name", "");
    }
  }

  async function handleRsvp(event) {
    event.preventDefault();
    const name = tidy($("#rsvp-name").value, 80);
    const persons = clampPersons($("#rsvp-persons").value);
    const message = String($("#rsvp-message").value || "").trim().slice(0, 500) || null;
    if (!name) {
      toast("Wie heisst du? Bitte gib deinen Namen ein.", "error");
      $("#rsvp-name").focus();
      return;
    }

    const button = $("#rsvp-form [type=submit]");
    setBusy(button, true);
    try {
      await backend.rsvp({ name, persons, message });
      memory.set("name", name);
      memory.set("rsvp", { name, persons });
      $("#rsvp-form").reset();
      showRsvpState();
      toast("Danke, " + name + "! Dein Schlüssel ist aktiviert. 🔑");
    } catch (error) {
      problem(error, "Die Anmeldung hat nicht geklappt. Versuch es bitte nochmal.");
    } finally {
      setBusy(button, false);
    }
  }

  function registerSomeoneElse() {
    $("#rsvp-done").hidden = true;
    $("#rsvp-form").hidden = false;
    $("#rsvp-name").value = "";
    $("#rsvp-name").focus();
  }

  function stepPersons(event) {
    const input = $("#rsvp-persons");
    input.value = clampPersons(Number(input.value) + Number(event.currentTarget.dataset.step));
  }

  /* ---------------------------------------------------------
     Snack-Liste
     --------------------------------------------------------- */
  let snacks = [];
  const openNodes = new Map(); // id → <li> mit Knopf
  const takenNodes = new Map(); // id → <li> unter "Kommt schon mit"
  let firstRender = true;
  let refreshCount = 0;
  let refreshTimer = 0;

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshSnacks, 250);
  }

  async function refreshSnacks() {
    if (!loggedIn()) return;
    const request = ++refreshCount;
    try {
      const list = await backend.snacks();
      if (request !== refreshCount) return; // eine neuere Abfrage ist schon unterwegs
      snacks = list;
      renderSnacks();
    } catch (error) {
      if (isLoginError(error)) return problem(error);
      console.error(error);
      if (firstRender) $("#snacks-loading").textContent = "Snacks konnten nicht geladen werden – wir versuchen es gleich nochmal.";
    }
  }

  function renderSnacks() {
    const animate = !firstRender && !reduceMotion;
    let mine = memory.get("mine", []);
    const seen = new Set();

    snacks.forEach((snack) => {
      seen.add(snack.id);
      if (snack.claimed_at) {
        removeNode(openNodes, snack.id, animate);
        if (!takenNodes.has(snack.id)) {
          const li = document.createElement("li");
          li.textContent = snack.name;
          takenNodes.set(snack.id, li);
          $("#taken-snacks").append(li);
          if (animate) li.classList.add("pop-in");
        }
        takenNodes.get(snack.id).classList.toggle("mine", mine.includes(snack.id));
      } else {
        removeNode(takenNodes, snack.id, false);
        mine = mine.filter((id) => id !== snack.id); // wieder frei, z. B. von euch zurückgesetzt
        if (!openNodes.has(snack.id)) {
          const li = openNode(snack);
          openNodes.set(snack.id, li);
          $("#open-snacks").append(li);
          if (animate) li.classList.add("pop-in");
        }
      }
    });
    [...openNodes.keys()].filter((id) => !seen.has(id)).forEach((id) => removeNode(openNodes, id, animate));
    [...takenNodes.keys()].filter((id) => !seen.has(id)).forEach((id) => removeNode(takenNodes, id, false));

    mine = mine.filter((id) => seen.has(id));
    memory.set("mine", mine);

    const mineNames = snacks.filter((s) => s.claimed_at && mine.includes(s.id)).map((s) => s.name);
    $("#mine").hidden = mineNames.length === 0;
    $("#mine-list").textContent = mineNames.join(", ");

    $("#snacks-loading").hidden = true;
    $("#open-empty").hidden = openNodes.size > 0;
    $("#taken").hidden = takenNodes.size === 0;
    firstRender = false;
  }

  function openNode(snack) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "snack";
    button.setAttribute("aria-label", snack.name + " mitbringen");

    const plus = document.createElement("span");
    plus.className = "plus";
    plus.setAttribute("aria-hidden", "true");
    plus.textContent = "+";
    const label = document.createElement("span");
    label.textContent = snack.name;

    button.append(plus, label);
    button.addEventListener("click", () => askToBring({ id: snack.id, name: snack.name }));
    li.append(button);
    return li;
  }

  // Snack verschwindet mit kleiner Animation, die übrigen rutschen nach.
  function removeNode(map, id, animate) {
    const node = map.get(id);
    if (!node) return;
    map.delete(id);
    if (!animate || !node.animate) {
      node.remove();
      return;
    }
    node.style.pointerEvents = "none";
    const done = () => {
      if (node.isConnected) slideTogether(node.parentElement, () => node.remove());
    };
    node
      .animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "translateY(-12px) scale(0.5)" },
        ],
        { duration: 380, easing: "cubic-bezier(.5, 0, .75, 0)", fill: "forwards" }
      )
      .finished.then(done, done);
    setTimeout(done, 700); // falls die Animation nicht läuft (z. B. Tab im Hintergrund)
  }

  function slideTogether(list, change) {
    if (!list) return change();
    const before = new Map([...list.children].map((el) => [el, el.getBoundingClientRect()]));
    change();
    [...list.children].forEach((el) => {
      const old = before.get(el);
      if (!old) return;
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (dx || dy) {
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 320,
          easing: "cubic-bezier(.2, .8, .2, 1)",
        });
      }
    });
  }

  async function handleAdd(event) {
    event.preventDefault();
    const input = $("#add-name");
    const snackName = tidy(input.value, 60);
    if (!snackName) {
      toast("Was bringst du mit? Schreib es ins Feld.", "error");
      input.focus();
      return;
    }

    // Steht schon offen auf der Liste? Dann einfach diesen übernehmen.
    const open = snacks.find((s) => !s.claimed_at && sameText(s.name, snackName));
    if (open) {
      input.value = "";
      askToBring({ id: open.id, name: open.name });
      return;
    }

    const name = memory.get("name", "");
    if (!name) {
      askToBring({ name: snackName });
      return;
    }

    const button = $("#add-form [type=submit]");
    setBusy(button, true);
    await bring({ name: snackName }, name);
    setBusy(button, false);
  }

  /* ---------------------------------------------------------
     Rückfrage "Du bringst … mit?"
     --------------------------------------------------------- */
  const dialog = $("#snack-dialog");
  let pending = null; // { id, name } = übernehmen · { name } = neu eintragen

  function askToBring(snack) {
    pending = snack;
    const name = memory.get("name", "");

    if (typeof dialog.showModal !== "function") {
      // Sehr alte Browser: einfache Rückfrage
      const answer = tidy(window.prompt("Du bringst " + snack.name + " mit? Dein Name:", name), 80);
      if (answer) bring(snack, answer);
      return;
    }

    $("#dlg-snack").textContent = snack.name;
    $("#dlg-name").value = name;
    $("#dlg-error").hidden = true;
    // Name schon bekannt → Fokus auf "Ja" (keine Tastatur), sonst aufs Namensfeld
    $("#dlg-name").autofocus = !name;
    $("#dlg-ok").autofocus = Boolean(name);
    dialog.showModal();
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  async function handleDialogSubmit(event) {
    event.preventDefault();
    const name = tidy($("#dlg-name").value, 80);
    $("#dlg-error").hidden = Boolean(name);
    if (!name) {
      $("#dlg-name").focus();
      return;
    }
    const button = $("#dlg-ok");
    setBusy(button, true);
    await bring(pending, name);
    setBusy(button, false);
  }

  async function bring(snack, name) {
    memory.set("name", name);
    if (!$("#rsvp-name").value) $("#rsvp-name").value = name;
    try {
      if (snack.id) {
        const won = await backend.claim(snack.id, name);
        closeDialog();
        if (won) {
          rememberMine(snack.id);
          sparkle(openNodes.get(snack.id));
          markClaimed(snack.id);
          toast("Super, du bringst " + snack.name + " mit! 🎉");
        } else {
          toast("Zu spät – " + snack.name + " hat sich gerade jemand anderes geschnappt.", "error");
        }
      } else {
        const id = await backend.add(snack.name, name);
        closeDialog();
        if (id) rememberMine(id);
        $("#add-name").value = "";
        toast("Danke! " + snack.name + " ist eingetragen. 🎉");
      }
    } catch (error) {
      closeDialog();
      problem(error);
    }
    refreshSnacks();
  }

  function rememberMine(id) {
    const mine = memory.get("mine", []);
    if (!mine.includes(id)) memory.set("mine", mine.concat(id));
  }

  function markClaimed(id) {
    const snack = snacks.find((s) => s.id === id);
    if (snack && !snack.claimed_at) {
      snack.claimed_at = new Date().toISOString();
      renderSnacks();
    }
  }

  function sparkle(node) {
    if (reduceMotion || !node || !node.animate) return;
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    for (let i = 0; i < 12; i++) {
      const dot = document.createElement("span");
      dot.className = "spark";
      dot.style.left = x + "px";
      dot.style.top = y + "px";
      document.body.append(dot);
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
      const distance = 34 + Math.random() * 38;
      dot
        .animate(
          [
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0.2)`, opacity: 0 },
          ],
          { duration: 700 + Math.random() * 300, easing: "cubic-bezier(.2, .7, .3, 1)" }
        )
        .finished.then(() => dot.remove(), () => dot.remove());
      setTimeout(() => dot.remove(), 1200);
    }
  }

  /* ---------------------------------------------------------
     Deko: Lichterkette und Schnee
     --------------------------------------------------------- */
  function hangLights() {
    const box = $(".lights");
    const width = box.clientWidth || window.innerWidth;
    const count = Math.max(7, Math.round(width / 52));
    const step = width / count;
    const top = 4;
    const sag = 18;
    const colors = [
      ["#ffd36e", "rgba(255, 196, 80, .75)"],
      ["#fff1cf", "rgba(255, 236, 190, .7)"],
      ["#ff5d6e", "rgba(255, 80, 100, .7)"],
      ["#ffb04a", "rgba(255, 160, 60, .7)"],
      ["#fff1cf", "rgba(255, 236, 190, .7)"],
    ];

    let wire = "M0 " + top;
    let bulbs = "";
    for (let i = 0; i < count; i++) {
      const mid = i * step + step / 2;
      wire += ` Q${mid.toFixed(1)} ${top + sag * 2} ${((i + 1) * step).toFixed(1)} ${top}`;
      const [color, glow] = colors[i % colors.length];
      const tilt = (i % 2 ? 1 : -1) * (4 + Math.random() * 6);
      bulbs +=
        `<span class="bulb" style="left:${mid.toFixed(1)}px;top:${top + sag + 3}px;` +
        `--c:${color};--g:${glow};--r:${tilt.toFixed(1)}deg;` +
        `--t:${(2.2 + Math.random() * 2.4).toFixed(2)}s;--d:${(-Math.random() * 4).toFixed(2)}s"></span>`;
    }
    box.innerHTML = `<svg viewBox="0 0 ${Math.round(width)} 64" preserveAspectRatio="none"><path d="${wire}"/></svg>${bulbs}`;
  }

  function letItSnow() {
    if (reduceMotion) return;
    const count = window.innerWidth < 640 ? 26 : 46;
    let flakes = "";
    for (let i = 0; i < count; i++) {
      const size = (1.5 + Math.random() * 3.5).toFixed(1);
      flakes +=
        `<i style="left:${(Math.random() * 100).toFixed(1)}%;width:${size}px;height:${size}px;` +
        `opacity:${(0.25 + Math.random() * 0.55).toFixed(2)};--fall:${(10 + Math.random() * 12).toFixed(1)}s;` +
        `--sway:${(3 + Math.random() * 3).toFixed(1)}s;--delay:${(-Math.random() * 22).toFixed(1)}s"></i>`;
    }
    $(".snow").innerHTML = flakes;
  }

  /* ---------------------------------------------------------
     Start
     --------------------------------------------------------- */
  function wireUp() {
    $("#login-form").addEventListener("submit", handleLogin);
    $("#pw-toggle").addEventListener("click", togglePassword);
    $("#rsvp-form").addEventListener("submit", handleRsvp);
    $("#rsvp-again").addEventListener("click", registerSomeoneElse);
    $("#rsvp-persons").addEventListener("change", (event) => {
      event.target.value = clampPersons(event.target.value);
    });
    document.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", stepPersons));
    $("#add-form").addEventListener("submit", handleAdd);
    $("#dlg-form").addEventListener("submit", handleDialogSubmit);
    $("#dlg-cancel").addEventListener("click", closeDialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(); // Tipp neben das Fenster
    });
    $("#logout").addEventListener("click", handleLogout);
    $("#keyring").addEventListener("click", jingle);

    let lastWidth = window.innerWidth;
    let timer = 0;
    window.addEventListener("resize", () => {
      if (window.innerWidth === lastWidth) return; // nur die Höhe (Adressleiste) hat sich geändert
      lastWidth = window.innerWidth;
      clearTimeout(timer);
      timer = setTimeout(hangLights, 200);
    });
  }

  async function start() {
    hangLights();
    letItSnow();
    wireUp();

    if (!backend) {
      // Die Supabase-Bibliothek konnte nicht geladen werden (z. B. kein Internet)
      $("#login").hidden = false;
      $("#login-form").hidden = true;
      const hint = $("#setup-hint");
      hint.textContent = "Die Seite konnte nicht vollständig laden. Prüf deine Internetverbindung und lade sie neu.";
      hint.hidden = false;
      return;
    }
    if (backend.preview) $("#setup-hint").hidden = false;

    backend.onSignedOut(() => {
      if (!loggedIn()) return;
      toast("Du wurdest abgemeldet – gib den Code bitte nochmal ein.", "info");
      showLogin();
    });

    let hasSession = false;
    try {
      hasSession = await backend.hasSession();
    } catch (error) {
      console.error(error);
    }
    if (hasSession) enterInvite(false);
    else showLogin();
  }

  start();
})();
