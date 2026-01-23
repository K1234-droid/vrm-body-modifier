export class HistoryManager<T> {
    private undoStack: T[] = [];
    private redoStack: T[] = [];
    private maxHistory: number;

    constructor(maxHistory: number = 50) {
        this.maxHistory = maxHistory;
    }

    push(state: T) {
        const stateCopy = JSON.parse(JSON.stringify(state));

        if (this.undoStack.length > 0 && JSON.stringify(this.undoStack[this.undoStack.length - 1]) === JSON.stringify(stateCopy)) {
            return;
        }

        this.undoStack.push(stateCopy);
        this.redoStack = [];

        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
    }

    undo(currentState: T): { state: T; canUndo: boolean; canRedo: boolean } | null {
        if (this.undoStack.length === 0) return null;

        const prevState = this.undoStack.pop()!;
        this.redoStack.push(JSON.parse(JSON.stringify(currentState)));

        return {
            state: prevState,
            canUndo: this.undoStack.length > 0,
            canRedo: true
        };
    }

    redo(currentState: T): { state: T; canUndo: boolean; canRedo: boolean } | null {
        if (this.redoStack.length === 0) return null;

        const nextState = this.redoStack.pop()!;
        this.undoStack.push(JSON.parse(JSON.stringify(currentState)));

        return {
            state: nextState,
            canUndo: true,
            canRedo: this.redoStack.length > 0
        };
    }

    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}
