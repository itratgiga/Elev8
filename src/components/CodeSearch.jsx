import '../code.css'

// "Find by product code" box: type a number or name, the list narrows; an exact code picks it straight away.
export default function CodeSearch({ value, onChange, onEnter, count, total }) {
  return (
    <div className="code-find">
      <label htmlFor="code-find-input">Find by product code</label>
      <span className="code-row">
        <input
          id="code-find-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.() } }}
          placeholder="Type a code like 102, or a name"
          inputMode="search"
          autoComplete="off"
        />
        {value && <button type="button" className="btn btn-quiet" onClick={() => onChange('')}>Clear</button>}
      </span>
      {value && <p className="code-msg" role="status">{count ? `${count} of ${total} products match` : 'No product with that code or name.'}</p>}
    </div>
  )
}
