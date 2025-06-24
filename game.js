let CELL_SIZE = 10; // Size of each cell in pixels
let GRID_WIDTH_CELLS = 70; // Number of cells wide
let GRID_HEIGHT_CELLS = 50; // Number of cells high
let CURRENT_DRAWING_COLOR = '#61dafb'; // Default alive cell color for new cells

// Define min/max values for cell size (zoom)
const MIN_CELL_SIZE = 5;
const MAX_CELL_SIZE = 30;

// Define min/max values for grid dimensions
const MIN_GRID_DIM = 10;
const MAX_GRID_DIM = 200;

// Define editing modes
export const GAME_MODE_CREATE = 'create';
export const GAME_MODE_DESTROY = 'destroy';
export const GAME_MODE_COPY = 'copy'; // New mode
export const GAME_MODE_PASTE = 'paste'; // New mode

let canvas;
let ctx;
// grid will now store color strings for alive cells, or 0 for dead cells.
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
let copyBuffer = null; // Stores the copied 2D array of cells (will now store colors or 0)
let selectionStart = null; // {row, col} of the first click for selection
let selectionCurrentCorner = null; // {row, col} of the current mouse position (for live preview in copy mode)
let isSelecting = false;   // True if the user is currently defining a selection rectangle (after first click, before second)

// Function to initialize the grid
function initGrid() {
    // Initialize grid with 0 for dead cells.
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
            // Check if the cell is alive (i.e., not 0, meaning it holds a color)
            if (grid[row][col] !== 0) {
                ctx.fillStyle = grid[row][col]; // Use the cell's specific color
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
            const cell = grid[row][col]; // Can be a color string or 0
            let liveNeighbors = 0;
            let neighborColors = []; // To store colors of live neighbors for reproduction

            // Check all 8 neighbors
            for (let i = -1; i <= 1; i++) {
                for (let j = -1; j <= 1; j++) {
                    if (i === 0 && j === 0) continue; // Skip the cell itself

                    const neighborRow = row + i;
                    const neighborCol = col + j;

                    // Check bounds and if neighbor is alive
                    if (neighborRow >= 0 && neighborRow < GRID_HEIGHT_CELLS &&
                        neighborCol >= 0 && neighborCol < GRID_WIDTH_CELLS) {
                        if (grid[neighborRow][neighborCol] !== 0) { // If neighbor is alive
                            liveNeighbors++;
                            neighborColors.push(grid[neighborRow][neighborCol]);
                        }
                    }
                }
            }

            // Apply Game of Life rules
            if (cell !== 0) { // Live cell (has a color)
                if (liveNeighbors < 2 || liveNeighbors > 3) {
                    newGrid[row][col] = 0; // Dies (underpopulation or overpopulation)
                } else {
                    newGrid[row][col] = cell; // Lives on, retaining its color
                }
            } else { // Dead cell (0)
                if (liveNeighbors === 3) {
                    // Becomes alive (reproduction). Inherit color from one of its 3 live neighbors.
                    // For simplicity, take the color of the first neighbor found.
                    // If neighborColors has 3 items, they are all live neighbors. Pick any.
                    newGrid[row][col] = neighborColors[0]; // Assign the color of one of its reproducing neighbors
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
            grid[row][col] = CURRENT_DRAWING_COLOR; // Set cell to alive with the current drawing color
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
            // Ensure gridRow and gridCol are within bounds before accessing grid
            if (gridRow >= 0 && gridRow < GRID_HEIGHT_CELLS && gridCol >= 0 && gridCol < GRID_WIDTH_CELLS) {
                copyBuffer[r][c] = grid[gridRow][gridCol]; // Copy the color or 0
            } else {
                // If selection goes out of bounds, treat it as empty cells
                copyBuffer[r][c] = 0;
            }
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
            grid[targetRow + r][targetCol + c] = copyBuffer[r][c]; // Paste the color or 0
        }
    }
    draw(); // Redraw the grid after pasting
}

/**
 * Updates the canvas dimensions based on current grid size and cell size, then redraws.
 */
function updateCanvasDimensionsAndDraw() {
    if (!canvas || !ctx) return; // Ensure canvas context is ready

    canvas.width = GRID_WIDTH_CELLS * CELL_SIZE;
    canvas.height = GRID_HEIGHT_CELLS * CELL_SIZE;
    draw();
}

// Public functions

/**
 * Initializes the game canvas and grid.
 * @param {HTMLCanvasElement} canvasElement The canvas element to use.
 */
export function initGame(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');

    initGrid(); // Initialize grid with default dimensions
    updateCanvasDimensionsAndDraw(); // Set initial canvas size and draw
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
            // If dragging selection out of bounds, constrain the current corner for preview
            selectionCurrentCorner = {
                row: Math.max(0, Math.min(GRID_HEIGHT_CELLS - 1, row)),
                col: Math.max(0, Math.min(GRID_WIDTH_CELLS - 1, col))
            };
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
    updateCanvasDimensionsAndDraw(); // Use this to redraw after clearing grid
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

/**
 * Sets the width and height of the game board.
 * Resets the grid and redraws the canvas.
 * @param {number} newWidth The new width in cells.
 * @param {number} newHeight The new height in cells.
 */
export function setGridDimensions(newWidth, newHeight) {
    if (isRunning) pauseGame(); // Pause game to prevent issues during resize

    // Validate and clamp new dimensions
    GRID_WIDTH_CELLS = Math.max(MIN_GRID_DIM, Math.min(MAX_GRID_DIM, newWidth || GRID_WIDTH_CELLS));
    GRID_HEIGHT_CELLS = Math.max(MIN_GRID_DIM, Math.min(MAX_GRID_DIM, newHeight || GRID_HEIGHT_CELLS));

    initGrid(); // Re-initialize grid with new dimensions (clears current pattern)
    updateCanvasDimensionsAndDraw(); // Update canvas size and redraw
    copyBuffer = null; // Clear copy buffer on grid resize
    clearSelectionState(); // Clear any active selection
}

/**
 * Increases the cell size, effectively zooming in.
 * @returns {number} The new CELL_SIZE.
 */
export function zoomIn() {
    if (CELL_SIZE < MAX_CELL_SIZE) {
        CELL_SIZE += 1;
        updateCanvasDimensionsAndDraw();
    }
    return CELL_SIZE;
}

/**
 * Decreases the cell size, effectively zooming out.
 * @returns {number} The new CELL_SIZE.
 */
export function zoomOut() {
    if (CELL_SIZE > MIN_CELL_SIZE) {
        CELL_SIZE -= 1;
        updateCanvasDimensionsAndDraw();
    }
    return CELL_SIZE;
}

/**
 * Sets the color for newly created alive cells.
 * @param {string} color The new color in a valid CSS format (e.g., '#RRGGBB').
 */
export function setCellColor(color) {
    CURRENT_DRAWING_COLOR = color;
    // No need to redraw all cells immediately as this only affects newly created cells
    // Existing cells retain their colors as stored in the grid.
}

/**
 * Returns the current game configuration (cell size, grid dimensions, current drawing color).
 * @returns {{cellSize: number, gridWidth: number, gridHeight: number, cellColor: string}}
 */
export function getGameConfig() {
    return {
        cellSize: CELL_SIZE,
        gridWidth: GRID_WIDTH_CELLS,
        gridHeight: GRID_HEIGHT_CELLS,
        cellColor: CURRENT_DRAWING_COLOR // Now returns the color for new cells
    };
}