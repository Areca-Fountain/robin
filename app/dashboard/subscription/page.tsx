"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCompany } from "@/components/dashboard/CompanyProvider";
import { openPayHereCheckout, type PayHerePaymentObject } from "@/lib/payhere-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function CompanySubscriptionPage() {
  const { me, authFetch, refresh } = useCompany();
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const orderId = searchParams.get("order_id");

  const [upgrading, setUpgrading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(() =>
    paymentStatus === "cancelled"
      ? "PayHere payment was cancelled. You are still on the Free Plan."
      : ""
  );

  useEffect(() => {
    if (paymentStatus !== "success" || !orderId) return;

    let active = true;
    async function confirmPayment() {
      try {
        const res = await authFetch("/api/payhere/confirm-client", {
          orderId,
          accountType: "company",
        });
        if (!active) return;
        if (res.ok) {
          setMessage(
            "Payment completed via PayHere! Your company is now on the Premium Plan ($10/month) with unlimited service letters."
          );
          await refresh();
        }
      } catch {
        // Ignore if already confirmed
      }
    }

    void confirmPayment();
    return () => {
      active = false;
    };
  }, [paymentStatus, orderId, authFetch, refresh]);

  if (!me) return null;

  const isPremium = me.company.subscriptionPlan === "Premium";

  const handlePayHereUpgrade = async () => {
    setError("");
    setMessage("");
    setUpgrading(true);

    try {
      const res = await authFetch("/api/payhere/checkout", {
        accountType: "company",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not start PayHere checkout.");
      }

      await openPayHereCheckout(data.payment as PayHerePaymentObject, {
        onCompleted: async (completedOrderId) => {
          try {
            const confirmRes = await authFetch("/api/payhere/confirm-client", {
              orderId: completedOrderId,
              accountType: "company",
            });
            if (confirmRes.ok) {
              setMessage(
                "Payment completed via PayHere! Your company is now on the Premium Plan ($10/month) with unlimited service letters."
              );
              await refresh();
            } else {
              const errData = await confirmRes.json().catch(() => ({}));
              setError(errData.error ?? "Payment received, but could not update plan.");
            }
          } catch {
            setError("Could not confirm payment with server.");
          } finally {
            setUpgrading(false);
          }
        },
        onDismissed: () => {
          setUpgrading(false);
          setError("PayHere checkout window was closed before completing payment.");
        },
        onError: (errMsg) => {
          setUpgrading(false);
          setError(`PayHere error: ${errMsg}`);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PayHere checkout failed.");
      setUpgrading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Subscription &amp; Plan</h1>
        <p className="mt-1 text-slate-600">
          Manage your company&apos;s Robin plan and issue capacity.
        </p>
      </div>

      {message && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Current Usage</CardTitle>
          <CardDescription>
            Active Plan: <strong>{me.company.subscriptionPlan}</strong> • Service Letters Issued:{" "}
            <strong>
              {me.stats.letters} / {isPremium ? "Unlimited" : "5"}
            </strong>
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className={!isPremium ? "border-2 border-indigo-600 shadow-md" : "border-slate-200"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Free Plan</CardTitle>
              {!isPremium && <Badge className="bg-indigo-600 text-white">Current Plan</Badge>}
            </div>
            <div className="text-3xl font-bold text-slate-900 pt-2">
              $0 <span className="text-sm font-normal text-slate-500">/ month</span>
            </div>
            <CardDescription>Ideal for small teams getting started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-slate-600">
              <li>✓ Issue up to <strong>5 service letters</strong></li>
              <li>✓ Cardano blockchain verification &amp; QR codes</li>
              <li>✓ Custom letter formats &amp; bulk Excel templates</li>
            </ul>
            <Button type="button" variant="outline" className="w-full" disabled>
              {!isPremium ? "Active Plan" : "Included"}
            </Button>
          </CardContent>
        </Card>

        <Card className={isPremium ? "border-2 border-indigo-600 shadow-md" : "border-slate-200"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Premium Plan</CardTitle>
              {isPremium && <Badge className="bg-indigo-600 text-white">Current Plan</Badge>}
            </div>
            <div className="text-3xl font-bold text-slate-900 pt-2">
              $10 <span className="text-sm font-normal text-slate-500">/ month</span>
            </div>
            <CardDescription>Unlimited service letter issuance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-slate-600">
              <li>✓ Issue <strong>unlimited</strong> service letters</li>
              <li>✓ Bulk Excel upload &amp; batch Cardano recording</li>
              <li>✓ Team member role delegation &amp; revocation</li>
            </ul>
            <Button
              type="button"
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={isPremium || upgrading || me.role === "team"}
              onClick={handlePayHereUpgrade}
            >
              {isPremium
                ? "Active Plan ✓"
                : me.role === "team"
                ? "Ask Company Owner to Upgrade"
                : upgrading
                ? "Opening PayHere..."
                : "Upgrade with PayHere ($10/mo)"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}