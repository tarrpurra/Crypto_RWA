import { createContext, useContext } from "react"

interface SwapPanelContextValue {
  open: boolean
  setOpen: (v: boolean) => void
}

export const SwapPanelContext = createContext<SwapPanelContextValue>({
  open: false,
  setOpen: () => {},
})

export function useSwapPanel() {
  return useContext(SwapPanelContext)
}
