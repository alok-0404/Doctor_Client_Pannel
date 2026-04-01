import { DNA } from 'react-loader-spinner'

interface DnaLoaderProps {
  label?: string
  size?: number
}

export const DnaLoader = ({ label = 'Loading...', size = 46 }: DnaLoaderProps) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '8px 0',
      }}
      aria-live="polite"
    >
      <DNA
        visible={true}
        height={String(size)}
        width={String(size)}
        ariaLabel="dna-loading"
        wrapperStyle={{}}
        wrapperClass="dna-wrapper"
      />
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
    </div>
  )
}
