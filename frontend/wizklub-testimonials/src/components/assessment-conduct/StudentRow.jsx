import { memo } from 'react'

import { bumpRenderCount } from '../../utils/conductPerf'



const INITIALS_COLORS = [

  '#E57373', '#F06292', '#BA68C8', '#9575CD',

  '#7986CB', '#64B5F6', '#4FC3F7', '#4DD0E1',

  '#4DB6AC', '#81C784', '#AED581', '#FF8A65',

]



function getInitials(name) {

  if (!name) return '?'

  return name.trim()[0].toUpperCase()

}



function getInitialsColor(name) {

  let hash = 0

  for (let i = 0; i < (name ?? '').length; i += 1) hash = name.charCodeAt(i) + ((hash << 5) - hash)

  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length]

}



function Avatar({ name, size = 40 }) {

  const initials = getInitials(name)

  const bg = getInitialsColor(name)

  return (

    <div

      className="conduct-student-row__avatar"

      style={{

        width: size,

        height: size,

        borderRadius: 8,

        background: bg,

        display: 'flex',

        alignItems: 'center',

        justifyContent: 'center',

        color: '#fff',

        fontWeight: 700,

        fontSize: size * 0.38,

      }}

      aria-hidden="true"

    >

      {initials}

    </div>

  )

}



function responseLabel(response) {

  const selected = response?.selected_answer

  if (selected == null || selected === '') return 'Waiting…'

  return String(selected)

}



function submitStatusLabel(student) {

  const status = student.submit_status

  if (!status) return null

  if (status === 'IN_PROGRESS') return null

  if (status === 'COMPLETED') {

    const score =

      student.submit_score_total != null ? ` · ${student.submit_score_total} pts` : ''

    return `Submitted${score}`

  }

  if (status === 'SKIPPED_ALREADY_COMPLETED') return 'Already submitted'

  if (status === 'FAILED') {

    const reason = student.submit_failure_stage

      ? String(student.submit_failure_stage).replace(/_/g, ' ')

      : 'Failed'

    return `Failed — ${reason}`

  }

  return status

}



function studentRowPropsAreEqual(prev, next) {

  const a = prev.student

  const b = next.student

  if (a === b) return true

  if (!a || !b) return false

  return (

    a.student_id === b.student_id &&

    a.username === b.username &&

    a.name === b.name &&

    a.has_sr_card === b.has_sr_card &&

    a.captured === b.captured &&

    a.response?.selected_answer === b.response?.selected_answer &&

    a.response?.verified === b.response?.verified &&

    a.submit_status === b.submit_status &&

    a.submit_failure_stage === b.submit_failure_stage &&

    a.submit_score_total === b.submit_score_total

  )

}



function StudentRow({ student }) {

  bumpRenderCount('StudentRow')

  const name = student.name || student.username || student.student_id

  const username = student.username || student.student_id

  const srAvailable = Boolean(student.has_sr_card)



  const captured = Boolean(student.captured)

  const submitLabel = submitStatusLabel(student)



  return (

    <div className={`conduct-student-row${captured ? ' conduct-student-row--captured' : ''}`}>

      <Avatar name={name} />

      <div className="conduct-student-row__info">

        <p className="conduct-student-row__name">{name}</p>

        <p className="conduct-student-row__meta">{username}</p>

      </div>

      <div className="conduct-student-row__right">

        <span

          className={`conduct-sr-badge ${srAvailable ? 'conduct-sr-badge--ok' : 'conduct-sr-badge--missing'}`}

        >

          {srAvailable ? 'SR Available' : 'SR Missing'}

        </span>

        {submitLabel ? (

          <span className="conduct-student-row__response conduct-student-row__response--submit">

            {submitLabel}

          </span>

        ) : (

          <span className="conduct-student-row__response">{responseLabel(student.response)}</span>

        )}

      </div>

    </div>

  )

}



export default memo(StudentRow, studentRowPropsAreEqual)

