import { CONTRACT_STATUS, type ContractStatus } from "@/lib/contractModel";

export function Status({ s }: { s: ContractStatus }) {
  const cls = s === "resilie" ? "badge-gray" : s === "termine" || s === "signe" ? "badge-gold" : "badge-gray";
  return <span className={cls}>{CONTRACT_STATUS[s]}</span>;
}
