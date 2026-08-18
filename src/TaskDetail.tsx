import { TaskCard } from "./TaskCard";
import { useApp } from "./store";

export default function TaskDetail({
  taskId,
  onBack,
}: {
  taskId: string;
  onBack: () => void;
}) {
  const { tasks, session } = useApp();
  const task = tasks.find((item) => item.id === taskId);
  const isLeader = session?.role === "leader";

  if (!task) {
    return (
      <section>
        <button className="back-link" type="button" onClick={onBack}>
          ← Back to tasks
        </button>
        <div className="panel">
          <p className="empty">This task is no longer on the board.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <button className="back-link" type="button" onClick={onBack}>
        ← Back to tasks
      </button>
      <TaskCard task={task} showAssign={isLeader} />
    </section>
  );
}
