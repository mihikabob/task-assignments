import { TaskCard } from "./TaskCard";
import { taskIncludesPerson } from "./lib/taskAssignees";
import { useApp, useCurrentUser } from "./store";

export default function MyTasks({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const { tasks, personById } = useApp();
  const user = useCurrentUser();
  const mine = tasks.filter((task) => taskIncludesPerson(task, user, personById));
  const isLeader = user?.role === "leader";

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="page-kicker">Your work</p>
          <h1>My tasks</h1>
        </div>
      </div>

      <div className="task-list">
        {mine.length === 0 ? (
          <div className="panel">
            <p className="empty">No tasks yet.</p>
          </div>
        ) : (
          mine.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showAssign={isLeader}
              showDescription={false}
              onOpen={() => onOpenTask(task.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
