import { Trans } from "@lingui/react/macro";
import { ArrowLeft } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";

const CONTACT_EMAIL = "hello@xexio.dev";
const HOME_URL = "https://xexio.dev";

export function PrivacyPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <a className="text-button back-link" href="/">
          <ArrowLeft size={14} aria-hidden="true" />
          <Trans>Back to home</Trans>
        </a>
      </header>

      <article className="legal-article">
        <p className="eyebrow"><Trans>Usage &amp; privacy</Trans></p>
        <h1><Trans>How Point Taken treats your data</Trans></h1>
        <p className="legal-lede">
          <Trans>
            Point Taken is a free, real-time planning-poker room for teams. It is built privacy-first:
            no accounts, no tracking, and no more data than a voting session actually needs. This page
            explains, in plain language, what is stored, what is not, and how to remove it.
          </Trans>
        </p>
        <p className="legal-meta"><Trans>Last updated: 5 July 2026</Trans></p>

        <section>
          <h2><Trans>The short version</Trans></h2>
          <ul>
            <li><Trans>No sign-up. No email, password, or profile is ever required.</Trans></li>
            <li><Trans>The only personal detail we handle is the display name you choose — a nickname is fine.</Trans></li>
            <li><Trans>No analytics, no advertising, no third-party trackers, and nothing is sold or shared.</Trans></li>
            <li><Trans>Rooms and everything in them are deleted automatically 7 days after the last activity.</Trans></li>
            <li><Trans>A facilitator can delete a room and all of its data instantly, at any time.</Trans></li>
          </ul>
        </section>

        <section>
          <h2><Trans>No accounts</Trans></h2>
          <p>
            <Trans>
              There is nothing to register. When you create or join a room you type a display name, to
              which the app appends a short random suffix so people with the same name stay distinct.
              You are identified only within that one room, only for as long as it exists.
            </Trans>
          </p>
        </section>

        <section>
          <h2><Trans>What is stored while a room is live</Trans></h2>
          <p><Trans>Each room keeps only what it needs to run the session on the server that hosts it:</Trans></p>
          <ul>
            <li><Trans>The room name, the planning deck, and the room settings.</Trans></li>
            <li><Trans>Participant display names and their role (facilitator, voter, or observer).</Trans></li>
            <li><Trans>Votes during a round and the finalized estimates in the room’s history.</Trans></li>
            <li><Trans>Short-lived reactions and raised hands, which clear on their own within seconds.</Trans></li>
            <li>
              <Trans>
                A one-way hash (SHA-256) of the facilitator recovery code. The code itself is shown to
                you once and is never stored — we keep only the hash so it can be checked, not recovered.
                Because it cannot be shown again, a facilitator can generate a replacement from room
                settings at any time. Doing so stores a new hash and stops the previous code working.
              </Trans>
            </li>
            <li><Trans>Timestamps for when the room was created, last used, and is due to expire.</Trans></li>
          </ul>
          <p>
            <Trans>
              Votes stay hidden from other participants until the facilitator reveals them (or everyone
              has voted, if auto-reveal is on). We do not store IP addresses alongside your activity.
            </Trans>
          </p>
        </section>

        <section>
          <h2><Trans>What stays on your device</Trans></h2>
          <p><Trans>Point Taken uses a small amount of browser storage purely to keep a session working and to save you re-typing. None of it is used for tracking, and it never leaves your device except the identity cookie, which is sent only to this site.</Trans></p>
          <ul>
            <li>
              <Trans>
                <strong>One identity cookie per room</strong> (<code>point_taken_identity</code>): a random
                token that binds your browser to your seat so your votes and role survive a refresh or
                reconnect. It is <code>HttpOnly</code>, <code>SameSite=Strict</code>, scoped to that room’s
                path, and expires within 7 days. It is not an advertising or analytics cookie.
              </Trans>
            </li>
            <li>
              <Trans>
                <strong>Local storage</strong>: your last-used display name and the link to your most recent
                room, so join and create forms can prefill and the home page can offer you the room again.
                It also remembers if you dismissed the “buy me a coffee” banner, so it stays hidden for a week,
                and your language choice if you switch languages in the app.
              </Trans>
            </li>
            <li>
              <Trans>
                <strong>Session storage</strong>: a facilitator recovery code is held briefly so it can be
                shown to you once after a room is created, then removed.
              </Trans>
            </li>
          </ul>
          <p><Trans>You can clear any of this at any time from your browser’s site-data settings.</Trans></p>
        </section>

        <section>
          <h2><Trans>What we do not collect</Trans></h2>
          <ul>
            <li><Trans>No analytics or usage tracking, and no advertising or marketing profiles.</Trans></li>
            <li><Trans>No third-party scripts, embeds, or trackers load in the app.</Trans></li>
            <li><Trans>No location data, contacts, or device fingerprinting.</Trans></li>
            <li><Trans>Your data is never sold, rented, or shared with anyone.</Trans></li>
          </ul>
        </section>

        <section>
          <h2><Trans>Hosting and infrastructure</Trans></h2>
          <p>
            <Trans>
              The app runs on Cloudflare’s network (Workers and Durable Objects). To deliver the service
              and protect it from abuse, Cloudflare processes connection details — including your IP
              address — transiently for connectivity, security, and rate-limiting. The app uses your IP
              only as a short-lived counter to limit how many rooms can be created or joined in a short
              window; it is not linked to your name or votes. This processing is covered by Cloudflare’s
              own privacy practices.
            </Trans>
          </p>
        </section>

        <section>
          <h2><Trans>Removing your data</Trans></h2>
          <ul>
            <li>
              <Trans>
                <strong>Delete now:</strong> a facilitator can open Room settings and choose “Delete room”
                to erase the room, its participants, votes, and history immediately.
              </Trans>
            </li>
            <li>
              <Trans>
                <strong>Automatic expiry:</strong> every room is permanently deleted 7 days after its last
                activity, whether or not anyone deletes it manually.
              </Trans>
            </li>
            <li>
              <Trans>
                <strong>On your device:</strong> clearing this site’s browser storage removes the saved
                name, recent-room link, and identity cookie.
              </Trans>
            </li>
          </ul>
        </section>

        <section>
          <h2><Trans>Free, and provided “as is”</Trans></h2>
          <p>
            <Trans>
              Point Taken is free to use for teams and individuals. It is offered as-is, without warranty
              of any kind: while it is built and maintained with care, availability, data retention, and
              fitness for any particular purpose are not guaranteed. Please don’t rely on a room as a
              system of record — export or note down estimates you need to keep, since rooms expire.
            </Trans>
          </p>
        </section>

        <section>
          <h2><Trans>Supporting the project</Trans></h2>
          <p>
            <Trans>
              Point Taken is free and has no ads or paid tiers. A small banner may invite you to support
              its upkeep by “buying me a coffee.” It is entirely optional and changes nothing about the app
              if you ignore or dismiss it — dismissing it just hides it for a week (see browser storage above).
              The link opens an external payment service (Buy Me a Coffee) in a new tab; no third-party
              scripts or trackers are loaded inside Point Taken itself, but once you follow that link you are
              on their site, subject to their own privacy practices.
            </Trans>
          </p>
        </section>

        <section>
          <h2><Trans>Changes to this statement</Trans></h2>
          <p>
            <Trans>
              If this statement changes, the “last updated” date above will change with it. Because there
              are no accounts, material changes cannot be emailed to you — the current version always lives
              at this page.
            </Trans>
          </p>
        </section>

        <section>
          <h2><Trans>Who runs this &amp; how to reach out</Trans></h2>
          <p>
            <Trans>
              Point Taken is made by <a href={HOME_URL} target="_blank" rel="noopener noreferrer">xexio.dev</a>,
              an independent developer based in Spain, and is not affiliated with any company. For any privacy
              question or request, contact me at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </Trans>
          </p>
        </section>
      </article>

      <footer className="legal-footer">
        <a href="/">Point Taken</a>
        <span>·</span>
        <span><Trans>Made by <a href={HOME_URL} target="_blank" rel="noopener noreferrer">xexio.dev</a> · Spain</Trans></span>
        <span>·</span>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        <span>·</span>
        <LanguageSwitcher />
      </footer>
    </main>
  );
}
