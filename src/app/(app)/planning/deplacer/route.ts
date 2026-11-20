import { moveTask } from "../../taches/actions";

export async function POST(req: Request) {
  const fd = await req.formData();
  await moveTask(fd);
  return new Response(null, { status: 204 });
}
