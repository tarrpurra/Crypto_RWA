"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const AUTH_TOKEN_KEY = "pacifica_auth_token";
const PORTFOLIO_WALLET_KEY = "aixrwa_portfolio_wallet_address";
const PORTFOLIO_WALLET_EVENT = "aixrwa-portfolio-wallet-change";
const COMPLIANCE_ACK_KEY = "yieldmind_compliance_verified_v1";

const TERMS_LAST_UPDATED = "June 2026";

export interface AuthUser {
  id: string;
  wallet?: {
    address: string;
    chainType: string;
  };
  email?: string;
  phone?: string;
}

interface AuthContextType {
  ready: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  ready: true,
  user: null,
  login: () => undefined,
  logout: async () => undefined,
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { address, isConnected, chain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const [hydrated, setHydrated] = useState(false);
  const [complianceVerified, setComplianceVerified] = useState(false);
  const [complianceDialogOpen, setComplianceDialogOpen] = useState(false);
  const [nonUsConfirmed, setNonUsConfirmed] = useState(false);
  const [usdyRestrictionConfirmed, setUsdyRestrictionConfirmed] = useState(false);
  const [termsConfirmed, setTermsConfirmed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHydrated(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setComplianceVerified(window.localStorage.getItem(COMPLIANCE_ACK_KEY) === "true");
  }, []);

  const user: AuthUser | null =
    isConnected && address
      ? {
          id: address,
          wallet: {
            address,
            chainType: chain?.name ?? "evm",
          },
        }
      : null;

  const openWalletModal = useCallback(() => {
    if (openConnectModal) {
      openConnectModal();
      return;
    }
    logger.warn("auth.connect.unavailable", {
      reason: "RainbowKit connect modal not available",
    });
  }, [openConnectModal]);

  const login = useCallback(() => {
    if (complianceVerified) {
      openWalletModal();
      return;
    }
    setComplianceDialogOpen(true);
  }, [complianceVerified, openWalletModal]);

  const confirmComplianceAndContinue = useCallback(() => {
    if (!(nonUsConfirmed && usdyRestrictionConfirmed && termsConfirmed)) {
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COMPLIANCE_ACK_KEY, "true");
    }
    setComplianceVerified(true);
    setComplianceDialogOpen(false);
    openWalletModal();
  }, [nonUsConfirmed, openWalletModal, termsConfirmed, usdyRestrictionConfirmed]);

  const logout = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.localStorage.removeItem(PORTFOLIO_WALLET_KEY);
      window.sessionStorage.removeItem(PORTFOLIO_WALLET_KEY);
      window.dispatchEvent(new Event(PORTFOLIO_WALLET_EVENT));
    }
    disconnect();
  }, [disconnect]);

  return (
    <AuthContext.Provider value={{ ready: hydrated, user, login, logout }}>
      {children}
      <Dialog open={complianceDialogOpen} onOpenChange={setComplianceDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden border-primary/30 bg-card p-0 shadow-[0_28px_80px_-36px_hsl(var(--primary)/0.45)] sm:w-full">
          <div className="border-b border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5 sm:px-7">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="font-display text-2xl text-foreground">
                YieldMind Access Verification
              </DialogTitle>
              <DialogDescription className="max-w-[62ch] text-sm leading-6 text-muted-foreground">
                To proceed to the dashboard, please verify your eligibility and compliance status below.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
            <section className="flex min-h-0 flex-col rounded-lg border border-border bg-surface-1/80">
              <div className="border-b border-border px-4 py-3">
                <p className="font-display text-lg text-foreground">
                  YieldMind Terms of Use & Risk Disclosures
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Last Updated: {TERMS_LAST_UPDATED}
                </p>
              </div>
              <ScrollArea className="h-64 max-h-[40dvh]">
                <div className="space-y-5 px-4 py-4 text-sm leading-6 text-foreground">
                  <div>
                    <p className="text-muted-foreground">
                      Welcome to YieldMind ("the Platform"). YieldMind is an experimental software prototype developed as a submission for the Mantle Hackathon. By connecting your wallet or interacting with the Platform, you explicitly agree to the following terms, conditions, and risk disclosures.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-foreground">
                      1. Eligibility & Regional Restrictions
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Non-US Covenant:</span> The Platform is strictly unavailable to citizens, residents, or entities of the United States of America ("US Persons"), or any individual accessing the platform from within the United States.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Sanctioned Jurisdictions:</span> You certify that you are not subject to economic or financial sanctions administered by any international regulatory body.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Local Compliance:</span> You are entirely responsible for ensuring that accessing and interacting with tokenized real-world assets (RWAs) complies with the local laws of your jurisdiction.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-foreground">
                      2. Hackathon Prototype Disclaimer
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">As-Is Provision:</span> YieldMind is an experimental, proof-of-concept prototype. It is provided on an "as-is" and "as-available" basis without any warranties, express or implied.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">No Financial Service:</span> The platform is built for evaluation and demonstration purposes only. It does not operate as a registered broker-dealer, asset manager, or financial custodian.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-foreground">
                      3. Real-World Asset (RWA) & USDY Risks
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Regulatory Fluidity:</span> Tokenized assets like USDY are financial instruments tied to real-world collateral and subject to shifting global compliance frameworks. Regulatory changes may restrict, freeze, or permanently alter your ability to transfer or redeem these tokens.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Counterparty & Issuer Risk:</span> Yield-bearing assets rely heavily on the solvency and operational integrity of third-party token issuers and custodians. YieldMind has no control over underlying collateral management.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Smart Contract Vulnerabilities:</span> Interacting with decentralized protocols exposes users to inherent technical risks, including smart contract bugs, network congestion, oracle failures, or malicious exploits.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-foreground">
                      4. No Financial or Investment Advice
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Information Only:</span> All dashboards, AI-driven yield insights, metrics, and data visualizations provided by YieldMind are for informational and educational purposes only.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">User Autonomy:</span> No content on the Platform constitutes a solicitation, recommendation, or endorsement to invest in any particular digital asset or financial strategy. You assume the sole risk of evaluating your web3 transactions.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-foreground">
                      5. Limitation of Liability
                    </p>
                    <p className="mt-2">
                      To the maximum extent permitted by applicable law, the YieldMind development team, its members, and affiliates shall not be liable for any direct, indirect, incidental, or consequential financial losses, smart contract exploits, or lost data arising from your use or inability to use the platform.
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </section>

            <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-1/80 px-3 py-3 transition-colors hover:bg-surface-2/70 sm:px-4 sm:py-4">
              <Checkbox
                checked={nonUsConfirmed}
                onCheckedChange={(checked) => setNonUsConfirmed(checked === true)}
                className="mt-1"
              />
              <span className="text-sm leading-6 text-foreground">
                I certify that I am not a US citizen, resident, or entity, and am not accessing this platform from the United States.
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-1/80 px-3 py-3 transition-colors hover:bg-surface-2/70 sm:px-4 sm:py-4">
              <Checkbox
                checked={usdyRestrictionConfirmed}
                onCheckedChange={(checked) => setUsdyRestrictionConfirmed(checked === true)}
                className="mt-1"
              />
              <span className="text-sm leading-6 text-foreground">
                I acknowledge that USDY is a tokenized, regulated asset subject to strict regional and transfer restrictions.
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-1/80 px-3 py-3 transition-colors hover:bg-surface-2/70 sm:px-4 sm:py-4">
              <Checkbox
                checked={termsConfirmed}
                onCheckedChange={(checked) => setTermsConfirmed(checked === true)}
                className="mt-1"
              />
              <span className="text-sm leading-6 text-foreground">
                I have read and agree to the YieldMind Terms of Use and Risk Disclosures shown above.
              </span>
            </label>

            <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-3 text-sm leading-6 text-muted-foreground sm:px-4">
              Wallet connection is available only after these declarations are accepted on this device.
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-4 py-4 sm:px-7 sm:py-5">
            <Button
              type="button"
              onClick={confirmComplianceAndContinue}
              disabled={!(nonUsConfirmed && usdyRestrictionConfirmed && termsConfirmed)}
              className="w-full sm:w-auto"
            >
              Verify & Connect Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthContext.Provider>
  );
}
