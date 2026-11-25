import { CONTRACT_STATUS, type ContractStatus } from "@/lib/contractModel";

export const STATUS_CLS: Record<ContractStatus, string> = {
  brouillon: "badge-gray",
  envoye: "badge-blue",
  signe: "badge-navy",
  en_cours: "badge-green",
  termine: "badge-gold",
  resilie: "badge-red",
};

export function Status({ s }: { s: ContractStatus }) {
  return (
    <span className={STATUS_CLS[s] ?? "badge-gray"}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {CONTRACT_STATUS[s] ?? s}
    </span>
  );
}
