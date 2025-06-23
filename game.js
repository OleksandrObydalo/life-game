const CELL_SIZE = 10; // Size of each cell in pixels
const GRID_WIDTH_CELLS = 70; // Number of cells wide
const GRID_HEIGHT_CELLS = 50; // Number of cells high

// Define editing modes
export const GAME_MODE_CREATE = 'create';
export const GAME_MODE_DESTROY = 'destroy';
export const GAME_MODE_COPY = 'copy'; // New mode
export const GAME_MODE_PASTE = 'paste'; // New mode

let canvas;
let ctx;
let grid;
let animationFrameId; // Not currently used, could be for requestAnimationFrame
let gameIntervalId;
let isRunning = false;
let gameSpeedMs = 100; // Default game speed in milliseconds
let currentEditingMode = GAME_MODE_CREATE; // Default editing mode

let isDrawing = false; // Flag to indicate if mouse button is held down for drawing/erasing
let lastDrawnRow = -1; // Stores the row of the last cell drawn during drag
let lastDrawnCol = -1; // Stores the col of the last cell drawn during drag

// New state variables for copy/paste
let copyBuffer = null; // Stores the copied 2D array of cells
let selectionStart = null; // {row, col} of the first click for selection
let selectionCurrentCorner = null; // {row, col} of the current mouse position (for live preview in copy mode)
let isSelecting = false;   // True if the user is currently defining a selection rectangle (after first click, before second)

// Function to initialize the grid
function initGrid() {
    grid = Array(GRID_HEIGHT_CELLS).fill(null).map(() => Array(GRID_WIDTH_CELLS).fill(0));
}

// Function to draw the grid lines
function drawGridLines() {
    ctx.strokeStyle = '#3a3f4a'; // Darker color for grid lines
    ctx.lineWidth = 0.5;

    // Draw vertical lines
    for (let i = 0; i <= GRID_WIDTH_CELLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, canvas.height);
        ctx.stroke();
    }

    // Draw horizontal lines
    for (let i = 0; i <= GRID_HEIGHT_CELLS; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * CELL_SIZE);
        ctx.lineTo(canvas.width, i * CELL_SIZE);
        ctx.stroke();
    }
}

// Function to draw cells based on the current grid state
function drawCells() {
    for (let row = 0; row < GRID_HEIGHT_CELLS; row++) {
        for (let col = 0; col < GRID_WIDTH_CELLS; col++) {
            if (grid[row][col] === 1) {
                ctx.fillStyle = '#61dafb'; // Alive cell color
                ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            } else {
                ctx.fillStyle = '#1a1e24'; // Dead cell background (matches canvas background)
                ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }
    }
}

// Function to calculate the next generation based on Game of Life rules
function getNextGeneration() {
    const newGrid = Array(GRID_HEIGHT_CELLS).fill(null).map(() => Array(GRID_WIDTH_CELLS).fill(0));

    for (let row = 0; row < GRID_HEIGHT_CELLS; row++) {
        for (let col = 0; col < GRID_WIDTH_CELLS; col++) {
            const cell = grid[row][col];
            let liveNeighbors = 0;

            // Check all 8 neighbors
            for (let i = -1; i <= 1; i++) {
                for (let j = -1; j <= 1; j++) {
                    if (i === 0 && j === 0) continue; // Skip the cell itself

                    const neighborRow = row + i;
                    const neighborCol = col + j;

                    // Check bounds
                    if (neighborRow >= 0 && neighborRow < GRID_HEIGHT_CELLS &&
                        neighborCol >= 0 && neighborCol < GRID_WIDTH_CELLS) {
                        liveNeighbors += grid[neighborRow][neighborCol];
                    }
                }
            }

            // Apply Game of Life rules
            if (cell === 1) { // Live cell
                if (liveNeighbors < 2 || liveNeighbors > 3) {
                    newGrid[row][col] = 0; // Dies (underpopulation or overpopulation)
                } else {
                    newGrid[row][col] = 1; // Lives on
                }
            } else { // Dead cell
                if (liveNeighbors === 3) {
                    newGrid[row][col] = 1; // Becomes alive (reproduction)
                } else {
                    newGrid[row][col] = 0; // Stays dead
                }
            }
        }
    }
    grid = newGrid;
}

// Function to update and render the game
function updateGame() {
    getNextGeneration();
    draw();
}

// Main draw function
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the entire canvas
    drawCells(); // Draw filled cells first
    drawGridLines(); // Draw grid lines on top
    if (currentEditingMode === GAME_MODE_COPY && isSelecting && selectionStart && selectionCurrentCorner) {
        drawSelectionBox(); // Draw selection box if in copy mode and selecting
    }
}

/**
 * Toggles the state of a single cell based on the current editing mode.
 * @param {number} row The row index of the cell.
 * @param {number} col The column index of the cell.
 */
function toggleCell(row, col) {
    if (row >= 0 && row < GRID_HEIGHT_CELLS && col >= 0 && col < GRID_WIDTH_CELLS) {
        if (currentEditingMode === GAME_MODE_CREATE) {
            grid[row][col] = 1; // Set cell to alive
        } else if (currentEditingMode === GAME_MODE_DESTROY) {
            grid[row][col] = 0; // Set cell to dead
        }
    }
}

/**
 * Calculates the actual top-left and bottom-right corners from two arbitrary points.
 * @param {{row: number, col: number}} p1
 * @param {{row: number, col: number}} p2
 * @returns {{topLeft: {row: number, col: number}, bottomRight: {row: number, col: number}}}
 */
function getMinMaxCorners(p1, p2) {
    const minRow = Math.min(p1.row, p2.row);
    const maxRow = Math.max(p1.row, p2.row);
    const minCol = Math.min(p1.col, p2.col);
    const maxCol = Math.max(p1.col, p2.col);
    return {
        topLeft: { row: minRow, col: minCol },
        bottomRight: { row: maxRow, col: maxCol }
    };
}

/**
 * Draws the selection box for copy mode.
 */
function drawSelectionBox() {
    // Use selectionStart and selectionCurrentCorner for the live preview
    const { topLeft, bottomRight } = getMinMaxCorners(selectionStart, selectionCurrentCorner);

    const width = (bottomRight.col - topLeft.col + 1) * CELL_SIZE;
    const height = (bottomRight.row - topLeft.row + 1) * CELL_SIZE;

    ctx.strokeStyle = '#FFD700'; // Gold color for selection border
    ctx.lineWidth = 2;
    ctx.strokeRect(topLeft.col * CELL_SIZE, topLeft.row * CELL_SIZE, width, height);

    ctx.fillStyle = 'rgba(255, 215, 0, 0.2)'; // Semi-transparent gold fill
    ctx.fillRect(topLeft.col * CELL_SIZE, topLeft.row * CELL_SIZE, width, height);
}

/**
 * Clears the current visual selection state (but not the copy buffer).
 */
function clearSelectionState() {
    selectionStart = null;
    selectionCurrentCorner = null;
    isSelecting = false;
    draw(); // Redraw to remove selection box
}

/**
 * Copies the selected rectangular area of cells into the copy buffer.
 * This is called after the second click in copy mode.
 * @param {{row: number, col: number}} endPoint The actual second corner clicked.
 */
function copySelection(endPoint) {
    if (!selectionStart || !endPoint) {
        console.warn("Selection not fully defined for copying.");
        return;
    }

    const { topLeft, bottomRight } = getMinMaxCorners(selectionStart, endPoint);

    const bufferRows = bottomRight.row - topLeft.row + 1;
    const bufferCols = bottomRight.col - topLeft.col + 1;

    copyBuffer = Array(bufferRows).fill(null).map(() => Array(bufferCols).fill(0));

    for (let r = 0; r < bufferRows; r++) {
        for (let c = 0; c < bufferCols; c++) {
            const gridRow = topLeft.row + r;
            const gridCol = topLeft.col + c;
            copyBuffer[r][c] = grid[gridRow][gridCol];
        }
    }
    console.log(`Cells copied to buffer (size R${bufferRows}xC${bufferCols}):`, copyBuffer);
    clearSelectionState(); // Clear visual selection after copying, but keep buffer.
}

/**
 * Pastes the cells from the copy buffer onto the grid, starting at the target coordinates.
 * Checks if the paste operation can fit within the grid boundaries.
 * @param {number} targetRow The row where the top-left corner of the buffer should be placed.
 * @param {number} targetCol The column where the top-left corner of the buffer should be placed.
 */
function pasteCells(targetRow, targetCol) {
    if (!copyBuffer) {
        console.warn("Copy buffer is empty. Nothing to paste.");
        return;
    }

    const bufferRows = copyBuffer.length;
    const bufferCols = copyBuffer[0].length;

    // Check if the pasted rectangle fits within the grid
    if (targetRow + bufferRows > GRID_HEIGHT_CELLS || targetCol + bufferCols > GRID_WIDTH_CELLS) {
        console.warn(`Cannot paste: Selection (R${bufferRows}xC${bufferCols}) goes out of bounds at (${targetRow}, ${targetCol}).`);
        return;
    }

    for (let r = 0; r < bufferRows; r++) {
        for (let c = 0; c < bufferCols; c++) {
            grid[targetRow + r][targetCol + c] = copyBuffer[r][c];
        }
    }
    draw(); // Redraw the grid after pasting
}

// Public functions

/**
 * Initializes the game canvas and grid.
 * @param {HTMLCanvasElement} canvasElement The canvas element to use.
 */
export function initGame(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');

    canvas.width = GRID_WIDTH_CELLS * CELL_SIZE;
    canvas.height = GRID_HEIGHT_CELLS * CELL_SIZE;

    initGrid();
    draw();
}

/**
 * Handles the mouse down event on the canvas.
 * Now handles cell drawing/erasing, selection start for copying, or pasting.
 * @param {number} x X-coordinate of the mouse.
 * @param {number} y Y-coordinate of the mouse.
 */
export function handleMouseDown(x, y) {
    if (isRunning) return; // Do not allow drawing/editing if game is running

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    // Ensure coordinates are within grid bounds
    if (row < 0 || row >= GRID_HEIGHT_CELLS || col < 0 || col >= GRID_WIDTH_CELLS) {
        return;
    }

    lastDrawnRow = row; // Used for continuous drawing in create/destroy modes
    lastDrawnCol = col;

    switch (currentEditingMode) {
        case GAME_MODE_CREATE:
        case GAME_MODE_DESTROY:
            isDrawing = true; // Start continuous drawing/erasing
            toggleCell(row, col); // Toggle the initial cell
            draw(); // Redraw immediately for feedback
            break;
        case GAME_MODE_COPY:
            if (!isSelecting) {
                // First click for selection
                selectionStart = { row, col };
                selectionCurrentCorner = { row, col }; // Initialize for live preview
                isSelecting = true;
                draw(); // Redraw to show initial selection point
            } else {
                // Second click for selection
                copySelection({ row, col }); // Pass the second click point to copy
                // isSelecting is set to false inside copySelection via clearSelectionState
            }
            break;
        case GAME_MODE_PASTE:
            if (copyBuffer) {
                pasteCells(row, col);
            } else {
                console.warn("No selection in buffer to paste.");
            }
            break;
    }
}

/**
 * Handles the mouse move event on the canvas for continuous drawing/erasing or live selection preview.
 * @param {number} x X-coordinate of the mouse.
 * @param {number} y Y-coordinate of the mouse.
 */
export function handleMouseMove(x, y) {
    if (isRunning) return; // Do not allow editing if game is running

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    // If mouse moves out of bounds, handle edge cases for drawing/selection
    if (row < 0 || row >= GRID_HEIGHT_CELLS || col < 0 || col >= GRID_WIDTH_CELLS) {
        if (isDrawing) { // For create/destroy
            isDrawing = false; // Stop drawing when cursor leaves canvas
        }
        if (currentEditingMode === GAME_MODE_COPY && isSelecting && selectionStart) {
            selectionCurrentCorner = selectionStart; // Reset preview to just the start point
            draw();
        }
        return;
    }

    switch (currentEditingMode) {
        case GAME_MODE_CREATE:
        case GAME_MODE_DESTROY:
            if (!isDrawing) return;
            // Only toggle if the mouse has moved to a new cell
            if (row !== lastDrawnRow || col !== lastDrawnCol) {
                toggleCell(row, col);
                lastDrawnRow = row;
                lastDrawnCol = col;
                draw(); // Redraw for immediate feedback
            }
            break;
        case GAME_MODE_COPY:
            if (isSelecting && selectionStart) {
                // Update selectionCurrentCorner for live preview
                selectionCurrentCorner = { row, col };
                draw(); // Redraw to show updated selection box
            }
            break;
        case GAME_MODE_PASTE:
            // No live preview for paste.
            break;
    }
}

/**
 * Handles the mouse up event to stop drawing.
 */
export function handleMouseUp() {
    isDrawing = false;
    lastDrawnRow = -1;
    lastDrawnCol = -1;
    // For copy mode, isSelecting remains true until the second click (handled in handleMouseDown).
    // So no action needed here for copy mode.
}

/**
 * Sets the current editing mode for cell manipulation.
 * Also resets selection/drawing states, but preserves the copy buffer.
 * @param {string} mode The mode to set.
 */
export function setEditingMode(mode) {
    if ([GAME_MODE_CREATE, GAME_MODE_DESTROY, GAME_MODE_COPY, GAME_MODE_PASTE].includes(mode)) {
        currentEditingMode = mode;
        isDrawing = false; // Stop any ongoing drawing

        // Clear temporary selection preview state, but NOT the copyBuffer itself
        selectionStart = null;
        selectionCurrentCorner = null;
        isSelecting = false;
        draw(); // Redraw to clear any lingering selection box from previous mode
    } else {
        console.warn(`Invalid editing mode: ${mode}`);
    }
}

/**
 * Starts the game simulation.
 */
export function startGame() {
    if (isRunning) return;
    isRunning = true;
    // Set an interval for game logic updates, using current gameSpeedMs
    gameIntervalId = setInterval(() => {
        updateGame();
    }, gameSpeedMs);
}

/**
 * Pauses the game simulation.
 */
export function pauseGame() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(gameIntervalId);
}

/**
 * Advances the game by one step (one generation).
 */
export function stepGame() {
    if (isRunning) pauseGame(); // Pause if running before stepping
    updateGame();
}

/**
 * Clears the grid and resets the game.
 */
export function resetGame() {
    pauseGame();
    initGrid();
    draw();
    copyBuffer = null; // Also clear the copy buffer on reset
    clearSelectionState(); // Ensure selection UI is reset
}

/**
 * Sets the speed of the game simulation.
 * If the game is running, it restarts the interval with the new speed.
 * @param {number} newSpeedMs The new interval in milliseconds per frame.
 */
export function setGameSpeed(newSpeedMs) {
    gameSpeedMs = newSpeedMs;
    if (isRunning) {
        clearInterval(gameIntervalId); // Clear existing interval
        gameIntervalId = setInterval(updateGame, gameSpeedMs); // Start new interval with new speed
    }
}