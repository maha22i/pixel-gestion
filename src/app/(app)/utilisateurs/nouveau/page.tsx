import { redirect } from "next/navigation";

export default function NewUser() {
  redirect("/utilisateurs?nouveau=1");
}
