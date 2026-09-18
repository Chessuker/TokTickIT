/**
 * Stand-in for the IT Staff and Administrator screens that later issues add
 * (#39 Queue, #41 Users). It exists so the role homes, navigation and guards
 * from the authentication foundation can be exercised before those screens
 * are built; it loads no data.
 */
function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1 className="zg-title">{title}</h1>
      <p className="zg-subtitle">This screen arrives in a later sprint issue.</p>
    </section>
  )
}

export default Placeholder
