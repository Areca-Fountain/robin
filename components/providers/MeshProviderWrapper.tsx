"use client";

import dynamic from "next/dynamic";
import "@meshsdk/react/styles.css";

const MeshProviderDynamic = dynamic(
  () => import("@meshsdk/react").then((mod) => mod.MeshProvider),
  { ssr: false }
);

export default function MeshProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MeshProviderDynamic>{children}</MeshProviderDynamic>;
}