// Standard panel page header: title + subtitle + optional action button.
export default function PageHead({ title, subtitle, action }) {
  return (
    <div className="dwp-pagehead">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
