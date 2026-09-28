import { useState } from "react";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Todo = {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  createdAt: Date | string;
};

export default function TodoList() {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: todos = [], isLoading } = trpc.todos.list.useQuery();

  const createTodo = trpc.todos.create.useMutation({
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setError(null);
      await utils.todos.list.invalidate();
    },
    onError: (mutationError) => setError(mutationError.message || "Could not add task"),
  });
  const toggleTodo = trpc.todos.toggle.useMutation({
    onSuccess: () => utils.todos.list.invalidate(),
    onError: (mutationError) => setError(mutationError.message || "Could not update task"),
  });
  const deleteTodo = trpc.todos.delete.useMutation({
    onSuccess: () => utils.todos.list.invalidate(),
    onError: (mutationError) => setError(mutationError.message || "Could not delete task"),
  });

  const addTodo = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Please enter a task title.");
      return;
    }
    setError(null);
    createTodo.mutate({ title: cleanTitle, description: description.trim() || undefined });
  };

  return (
    <section className="min-h-screen bg-black px-6 py-8 text-white md:px-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b-4 border-red-600 pb-6">
          <div>
            <p className="mb-2 text-sm font-bold tracking-[0.3em] text-red-500">TRADING WORKFLOW</p>
            <h1 className="text-5xl font-black md:text-7xl">TO-DO LIST</h1>
            <p className="mt-3 text-gray-400">Track research, entries, and review tasks alongside your signals.</p>
          </div>
          <a href="/" className="border-2 border-gray-700 px-5 py-3 font-bold hover:border-green-500">← DASHBOARD</a>
        </div>

        <div className="mb-8 border-2 border-gray-700 bg-gray-950 p-5">
          <div className="mb-4 flex items-center gap-2 text-xl font-black"><Plus size={22} className="text-green-500" /> ADD TASK</div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTodo()} placeholder="Task title" className="border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-green-500" />
            <input value={description} onChange={(event) => setDescription(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTodo()} placeholder="Notes (optional)" className="border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-green-500" />
            <button disabled={createTodo.isPending} onClick={addTodo} className="flex items-center justify-center gap-2 bg-green-600 px-6 py-3 font-black hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
              {createTodo.isPending ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} ADD TASK
            </button>
          </div>
          {error && <div className="mt-3 flex items-center gap-2 border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200"><X size={16} /> {error}</div>}
        </div>

        <div className="mb-3 flex items-center justify-between"><h2 className="text-2xl font-black">YOUR TASKS</h2><span className="text-sm text-gray-400">{todos.filter((todo: Todo) => todo.completed).length}/{todos.length} complete</span></div>
        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div> : todos.length === 0 ? <div className="border-2 border-dashed border-gray-700 py-16 text-center text-gray-500">No tasks yet. Add your first trading task above.</div> : <div className="space-y-3">{todos.map((todo: Todo) => <div key={todo.id} className={`flex items-start gap-3 border-2 p-4 ${todo.completed ? "border-gray-800 bg-gray-950 opacity-60" : "border-gray-700 bg-gray-900"}`}>
          <button aria-label={todo.completed ? "Mark task active" : "Complete task"} onClick={() => toggleTodo.mutate({ id: todo.id, completed: !todo.completed })} className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center border-2 ${todo.completed ? "border-green-500 bg-green-600" : "border-gray-500 hover:border-green-500"}`}>{todo.completed && <Check size={15} />}</button>
          <div className="min-w-0 flex-1"><div className={`font-bold ${todo.completed ? "line-through" : ""}`}>{todo.title}</div>{todo.description && <div className="mt-1 text-sm text-gray-400">{todo.description}</div>}</div>
          <button aria-label="Delete task" onClick={() => deleteTodo.mutate({ id: todo.id })} className="text-gray-500 hover:text-red-500"><Trash2 size={18} /></button>
        </div>)}</div>}
      </div>
    </section>
  );
}
