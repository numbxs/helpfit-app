import type { Metadata } from "next";
import { MindView } from "@/components/mind/mind-view";

export const metadata: Metadata = { title: "Mind" };

export default function MindPage() {
  return <MindView />;
}
