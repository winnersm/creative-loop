"use client"

import { useState } from "react"
import { create } from "zustand"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ArchiveReason } from "@/generated/prisma/enums"
import { ARCHIVE_REASON, ARCHIVE_REASON_CHOICES } from "@/lib/status"

type Prompt = { title: string; description?: string; confirm: string; resolve: (v: string | null) => void }

export type ArchiveAnswer = { archiveReason: ArchiveReason; note: string }
type ArchivePrompt = {
  title: string
  description?: string
  confirm: string
  /** Motivo fijo (p. ej. «Descartar»): no se muestra la lista, la nota es opcional. */
  preset?: ArchiveReason
  resolve: (v: ArchiveAnswer | null) => void
}
type ConfirmPrompt = { title: string; description?: string; confirm: string; destructive?: boolean; resolve: (v: boolean) => void }

const useReasonStore = create<{ prompt: Prompt | null; set: (p: Prompt | null) => void }>((set) => ({
  prompt: null,
  set: (prompt) => set({ prompt }),
}))

const useArchiveStore = create<{ prompt: ArchivePrompt | null; set: (p: ArchivePrompt | null) => void }>((set) => ({
  prompt: null,
  set: (prompt) => set({ prompt }),
}))

const useConfirmStore = create<{ prompt: ConfirmPrompt | null; set: (p: ConfirmPrompt | null) => void }>((set) => ({
  prompt: null,
  set: (prompt) => set({ prompt }),
}))

/** Pide el motivo de archivo (lista cerrada + nota). Devuelve null si se cancela. */
export function askArchive(
  title: string,
  opts: { description?: string; confirm?: string; preset?: ArchiveReason } = {},
): Promise<ArchiveAnswer | null> {
  return new Promise((resolve) =>
    useArchiveStore.getState().set({ title, confirm: opts.confirm ?? "Archivar", description: opts.description, preset: opts.preset, resolve }),
  )
}

/** Confirmación simple. */
export function askConfirm(
  title: string,
  opts: { description?: string; confirm?: string; destructive?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) =>
    useConfirmStore.getState().set({ title, confirm: opts.confirm ?? "Confirmar", description: opts.description, destructive: opts.destructive, resolve }),
  )
}

/** Pide un motivo en un diálogo. Devuelve null si se cancela. */
export function askReason(title: string, opts: { description?: string; confirm?: string } = {}): Promise<string | null> {
  return new Promise((resolve) =>
    useReasonStore.getState().set({ title, description: opts.description, confirm: opts.confirm ?? "Confirmar", resolve }),
  )
}

export function ReasonDialogHost() {
  return (
    <>
      <FreeReasonDialog />
      <ArchiveDialog />
      <ConfirmDialog />
    </>
  )
}

function ArchiveDialog() {
  const { prompt, set } = useArchiveStore()
  const [reason, setReason] = useState<ArchiveReason | "">("")
  const [note, setNote] = useState("")
  const chosen = prompt?.preset ?? reason

  const close = (value: ArchiveAnswer | null) => {
    prompt?.resolve(value)
    set(null)
    setReason("")
    setNote("")
  }
  const ready = !!chosen && (chosen !== "OTHER" || !!note.trim())

  return (
    <Dialog open={!!prompt} onOpenChange={(open) => !open && close(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prompt?.title}</DialogTitle>
          {prompt?.description && <DialogDescription>{prompt.description}</DialogDescription>}
        </DialogHeader>
        {!prompt?.preset && (
          <div className="grid gap-1.5" role="radiogroup" aria-label="Motivo">
            {ARCHIVE_REASON_CHOICES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-accent">
                <input type="radio" name="archive-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-primary" />
                {ARCHIVE_REASON[r]}
              </label>
            ))}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Nota {chosen === "OTHER" ? "(obligatoria)" : "(opcional)"}
          </Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Por qué…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(null)}>
            Cancelar
          </Button>
          <Button disabled={!ready} onClick={() => chosen && close({ archiveReason: chosen, note: note.trim() })}>
            {prompt?.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmDialog() {
  const { prompt, set } = useConfirmStore()
  const close = (value: boolean) => {
    prompt?.resolve(value)
    set(null)
  }
  return (
    <Dialog open={!!prompt} onOpenChange={(open) => !open && close(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prompt?.title}</DialogTitle>
          {prompt?.description && <DialogDescription className="whitespace-pre-line">{prompt.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={prompt?.destructive ? "destructive" : "default"} onClick={() => close(true)}>
            {prompt?.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FreeReasonDialog() {
  const { prompt, set } = useReasonStore()
  const [text, setText] = useState("")

  const close = (value: string | null) => {
    prompt?.resolve(value)
    set(null)
    setText("")
  }

  return (
    <Dialog open={!!prompt} onOpenChange={(open) => !open && close(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prompt?.title}</DialogTitle>
          {prompt?.description && <DialogDescription>{prompt.description}</DialogDescription>}
        </DialogHeader>
        <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Motivo…" rows={3} />
        <DialogFooter>
          <Button variant="outline" onClick={() => close(null)}>
            Cancelar
          </Button>
          <Button disabled={!text.trim()} onClick={() => close(text.trim())}>
            {prompt?.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
