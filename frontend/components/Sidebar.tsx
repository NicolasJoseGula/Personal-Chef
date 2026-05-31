"use client";

import { Conversation } from "@/lib/types";

interface Props {
    open: boolean;
    conversations: Conversation[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
}

export default function Sidebar({
    open,
    conversations,
    activeId,
    onSelect,
    onNew,
    onDelete,
}: Props) {
    return (
        <aside className={`sidebar ${open ? "" : "collapsed"}`}>
            <div className="sidebar-header">
                <h1>🧑‍🍳 Personal Chef</h1>
                <button className="new-btn" onClick={onNew}>
                    ➕ New recipe
                </button>
            </div>

            <div className="conv-list">
                {conversations.length === 0 && (
                    <p className="conv-empty">You don't have any conversations yet</p>
                )}
                {conversations.map((c) => (
                    <div
                        key={c.id}
                        className={`conv-item ${c.id === activeId ? "active" : ""}`}
                        onClick={() => onSelect(c.id)}
                    >
                        <span className="conv-title">{c.title}</span>
                        <button
                            className="conv-del"
                            title="Delete"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(c.id);
                            }}
                        >
                            🗑️
                        </button>
                    </div>
                ))}
            </div>

            <div className="sidebar-footer">
                Chats are automatically deleted after 12 hours of inactivity
            </div>
        </aside>
    );
}