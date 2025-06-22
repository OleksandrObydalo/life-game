const CELL_SIZE = 10; // Size of each cell in pixels
const GRID_WIDTH_CELLS = 70; // Number of cells wide
const GRID_HEIGHT_CELLS = 50; // Number of cells high

// Define editing modes
export const GAME_MODE_CREATE = 'create';
export const GAME_MODE_DESTROY = 'destroy';

let canvas;
let ctx;
let grid;
let animationFrameId; // Not currently used, could be for requestAnimationFrame
let gameIntervalId;
let isRunning = false;
let gameSpeedMs = 100; // Default game speed in milliseconds
let currentEditingMode = GAME_MODE_CREATE; // Default editing mode

let isDrawing = false; // New: Flag to indicate if mouse button is held down for drawing
let lastDrawnRow = -1; // New: Stores the row of the last cell drawn during drag
let lastDrawnCol = -1; // New: Stores the col of the last cell drawn during drag

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
        draw(); // Redraw immediately
    }
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
 * Handles the mouse down event on the canvas to start drawing/erasing.
 * @param {number} x X-coordinate of the mouse.
 * @param {number} y Y-coordinate of the mouse.
 */
export function handleMouseDown(x, y) {
    if (isRunning) return; // Do not allow drawing if game is running

    isDrawing = true;
    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);
    
    toggleCell(row, col);
    lastDrawnRow = row;
    lastDrawnCol = col;
}

/**
 * Handles the mouse move event on the canvas for continuous drawing/erasing.
 * @param {number} x X-coordinate of the mouse.
 * @param {number} y Y-coordinate of the mouse.
 */
export function handleMouseMove(x, y) {
    if (!isDrawing) return; // Only draw if mouse is down
    if (isRunning) return; // Do not allow drawing if game is running

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    // Only toggle if the mouse has moved to a new cell
    if (row !== lastDrawnRow || col !== lastDrawnCol) {
        // A simple approach: just toggle the current cell.
        // For a more precise line, Bresenham's algorithm could be used
        // to fill in cells between (lastDrawnRow, lastDrawnCol) and (row, col).
        toggleCell(row, col);
        lastDrawnRow = row;
        lastDrawnCol = col;
    }
}

/**
 * Handles the mouse up event to stop drawing.
 */
export function handleMouseUp() {
    isDrawing = false;
    lastDrawnRow = -1; // Reset last drawn cell coordinates
    lastDrawnCol = -1;
}

/**
 * Sets the current editing mode for cell manipulation.
 * @param {string} mode The mode to set, either GAME_MODE_CREATE or GAME_MODE_DESTROY.
 */
export function setEditingMode(mode) {
    if (mode === GAME_MODE_CREATE || mode === GAME_MODE_DESTROY) {
        currentEditingMode = mode;
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