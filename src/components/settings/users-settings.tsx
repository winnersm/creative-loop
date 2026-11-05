"use client"

import { KeyRound, Pencil, UserPlus } from "lucide-react"
import { useState } from "react"
import { UserAvatar } from "@/components/board/user-avatar"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import type { Role, UserStatus } from "@/generated/prisma/enums"
import { timeAgo } from "@/lib/format"
import { ROLE_LABEL } from "@/lib/status"
import { createUser, updateUser } from "@/server/settings"
import { askReason } from "@/components/board/reason-dialog"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "./offers-settings"

type User = { id: string; name: string; email: string; role: Role; status: UserStatus; lastLoginAt: Date | null }

/** F-104 · Usuarios: alta, rol y desactivación. */
export function UsersSettings({ users, meId }: { users: User[]; meId: string }) {
  const { exec, pending } = useAction()
  const [form, setForm] = useState({ name: "", email: "", role: "EDITOR" as Role, password: "" })
  const [editing, setEditing] = useState<{ id: string; name: string; email: string } | null>(null)

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Usuario</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Último acceso</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-t ${u.status === "INACTIVE" ? "opacity-50" : ""}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={u.name} size={26} />
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <NativeSelect
                    className="w-32"
                    value={u.role}
                    disabled={u.id === meId || pending}
                    onChange={(e) => void exec(() => updateUser(u.id, { role: e.target.value as Role }), "Rol actualizado")}
                  >
                    {Object.entries(ROLE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "nunca"}</td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={u.id === meId || pending}
                    onClick={() =>
                      void exec(
                        () => updateUser(u.id, { status: u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
                        u.status === "ACTIVE" ? "Usuario desactivado" : "Usuario activado",
                      )
                    }
                  >
                    {u.status === "ACTIVE" ? "Desactivar" : "Activar"}
                  </Button>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Editar nombre y email"
                    onClick={() => setEditing({ id: u.id, name: u.name, email: u.email })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Cambiar contraseña"
                    onClick={async () => {
                      const pw = await askReason(`Nueva contraseña para ${u.name}`, {
                        description: "Mínimo 8 caracteres. Compártela por un canal seguro.",
                        confirm: "Cambiar",
                      })
                      if (pw) void exec(() => updateUser(u.id, { password: pw }), "Contraseña cambiada")
                    }}
                  >
                    <KeyRound />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              id="edit-user"
              className="grid gap-3"
              onSubmit={async (e) => {
                e.preventDefault()
                const ok = await exec(
                  () => updateUser(editing.id, { name: editing.name, email: editing.email }),
                  "Usuario actualizado",
                )
                if (ok !== null) setEditing(null)
              }}
            >
              <Field label="Nombre">
                <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Email (se usa para iniciar sesión)">
                <Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="edit-user" disabled={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <form
        className="h-fit space-y-3 rounded-lg border bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const ok = await exec(() => createUser(form), "Usuario creado")
          if (ok !== null) setForm({ name: "", email: "", role: "EDITOR", password: "" })
        }}
      >
        <h3 className="font-semibold">Añadir usuario</h3>
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Rol">
          <NativeSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Contraseña inicial">
          <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="mín. 8 caracteres" />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          <UserPlus /> Crear usuario
        </Button>
      </form>
    </div>
  )
}
