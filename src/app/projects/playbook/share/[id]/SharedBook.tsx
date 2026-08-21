"use client";

/**
 * The read-only view a coach sends to a player.
 *
 * Everything that changes anything is gone; the animation stays, because that
 * is the part a player actually learns from. Printing stays too — a parent
 * opening this on a phone should be able to hand over a paper copy.
 */

import { useState } from "react";
import Link from "next/link";

import "../../styles.css";

import Field from "../../Field";
import PlayDiagram from "../../PlayDiagram";
import PlayDetail from "../../PlayDetail";
import { PRODUCT } from "../../product";
import { resolvePlay } from "@/lib/playbook/resolve";
import { variant as variantOf } from "@/lib/playbook/field";
import { formationById } from "@/lib/playbook/formations";
import type { Playbook } from "@/lib/playbook/types";

export default function SharedBook({ book }: { book: Playbook }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = book.entries.find((e) => e.play.spec.id === openId);

  return (
    <main className="pb-page">
      <header className="pb-bar" data-side="offense">
        <span className="pb-wordmark">
          <span aria-hidden>▚</span> {PRODUCT.name}
        </span>
        <span className="pb-label">{book.name} · shared, read only</span>
        <span className="pb-bar-spacer" />
        <a className="pb-btn" href={`/projects/playbook/print/${book.id}?layout=grid12`} target="_blank" rel="noreferrer">
          Print
        </a>
        <Link className="pb-btn" href="/projects/playbook">Open the library</Link>
      </header>

      {open ? (
        <PlayDetail
          play={open.play}
          variant={book.variant}
          style={book.style}
          inBook
          readOnly
          onEdit={() => {}}
          onToggleBook={() => {}}
          onClose={() => setOpenId(null)}
        />
      ) : (
        <div className="pb-container">
          <h1 className="pb-h1">{book.name}</h1>
          <p className="pb-label" style={{ marginBottom: "var(--s5)" }}>
            {book.entries.length} plays · {variantOf(book.variant).label}
          </p>

          <div className="pb-grid">
            {book.entries.map((e) => {
              const spec = e.play.spec;
              const v = spec.variantScope.includes(book.variant) ? book.variant : spec.variantScope[0];
              const fv = variantOf(v);
              const resolved = resolvePlay(e.play, v, false, book.style);
              return (
                <article className="pb-card" key={spec.id}>
                  <button className="pb-card-diagram" onClick={() => setOpenId(spec.id)} aria-label={`Open ${spec.name}`}>
                    <Field variant={fv} density="card" showRules={false} ariaLabel={`${spec.name} diagram`}>
                      <PlayDiagram play={resolved} variant={fv} style={book.style} density="card" />
                    </Field>
                  </button>
                  <div className="pb-card-body">
                    <h3 className="pb-card-title">
                      {e.callNumber ? `${e.callNumber} · ` : ""}
                      {spec.name}
                    </h3>
                    <p className="pb-card-sub">
                      {e.section ?? formationById(spec.formationId)?.name ?? spec.formationId}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          {book.entries.length === 0 && (
            <p className="pb-prose pb-empty">This playbook is empty so far.</p>
          )}
        </div>
      )}
    </main>
  );
}
