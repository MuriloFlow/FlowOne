import logo from '@/assets/logo.png'

type ScopeLockProps = {
  message: string
  onSignOut: () => void
}

export function ScopeLock({ message, onSignOut }: ScopeLockProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#111111] px-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <img src={logo} alt="FLOW" className="mb-8 h-[18px] w-auto object-contain opacity-80" />
        <h1 className="text-[22px] text-[#F0EFEC]/88">Conta sem unidade</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-[#F0EFEC]/46">{message}</p>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-7 h-9 rounded-[8px] bg-[#F0EFEC] px-4 text-[13px] text-[#111111]"
        >
          Sair
        </button>
      </div>
    </div>
  )
}
