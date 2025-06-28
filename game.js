let CELL_SIZE = 10; // Size of each cell in pixels
let GRID_WIDTH_CELLS = 70; // Number of cells wide
let GRID_HEIGHT_CELLS = 50; // Number of cells high
let CURRENT_DRAWING_COLOR = '#61dafb'; // Default alive cell color for new cells
let MUTATION_H_S_SPEED = 0; // New parameter: 0-50 range, affects H, S mutation on reproduction
let MUTATION_L_SPEED = 0; // New parameter: 0-50 range, affects L mutation on reproduction

const LIGHTNESS_DEATH_THRESHOLD = 5; // Lightness value below which a cell dies (0-100)

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
export const GAME_MODE_RECOLOR = 'recolor'; // New mode

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

// Helper functions for color conversion (Hex <-> RGB <-> HSL)
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;

    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHex(r, g, b) {
    const toHex = (c) => {
        const hex = Math.round(c).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

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
                    // Check if all three neighbors have the same color for mutation
                    const uniqueNeighborColors = new Set(neighborColors);
                    
                    if (uniqueNeighborColors.size === 1 && (MUTATION_H_S_SPEED > 0 || MUTATION_L_SPEED > 0)) {
                        const baseColorHex = uniqueNeighborColors.values().next().value;
                        const rgb = hexToRgb(baseColorHex);
                        let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

                        const randomMutation = (maxRange) => (Math.random() * 2 * maxRange) - maxRange;

                        // Apply H and S mutation
                        if (MUTATION_H_S_SPEED > 0) {
                            h = h + randomMutation(MUTATION_H_S_SPEED);
                            s = s + randomMutation(MUTATION_H_S_SPEED);
                        }
                        
                        // Apply L mutation
                        if (MUTATION_L_SPEED > 0) {
                            l = l + randomMutation(MUTATION_L_SPEED);
                        }
                        
                        // Clamp HSL values to valid ranges
                        h = (h % 360 + 360) % 360; // Ensure H is always positive and within 0-360
                        s = Math.max(0, Math.min(100, s));
                        l = Math.max(0, Math.min(100, l));

                        // Check for death by low brightness
                        if (l < LIGHTNESS_DEATH_THRESHOLD) {
                            newGrid[row][col] = 0; // Cell dies due to low brightness
                        } else {
                            const mutatedRgb = hslToRgb(h, s, l);
                            newGrid[row][col] = rgbToHex(mutatedRgb.r, mutatedRgb.g, mutatedRgb.b);
                        }
                    } else {
                        // If mutation speed is 0 or neighbors have different colors,
                        // new cell inherits color from the first live neighbor found.
                        newGrid[row][col] = neighborColors[0];
                    }
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
    if ((currentEditingMode === GAME_MODE_COPY || currentEditingMode === GAME_MODE_RECOLOR) && isSelecting && selectionStart && selectionCurrentCorner) {
        drawSelectionBox(); // Draw selection box if in copy mode or recolor mode and selecting
    }
}

/**
 * Toggles the state of a single cell based on the current editing mode.
 * @param {number} row The row index of the cell.
 * @param {number} col The column index of the cell.
 */
function toggleCell(row, col) {
    if (row >= 0 && row < GRID_HEIGHT_CELLS && col < GRID_WIDTH_CELLS && col >= 0) {
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
 * Changes the color of live cells within the selected rectangular area to the new color.
 * @param {{row: number, col: number}} endPoint The actual second corner clicked.
 * @param {string} newColor The color to apply to the selected live cells.
 */
function recolorSelection(endPoint, newColor) {
    if (!selectionStart || !endPoint) {
        console.warn("Selection not fully defined for recoloring.");
        return;
    }

    const { topLeft, bottomRight } = getMinMaxCorners(selectionStart, endPoint);

    for (let row = topLeft.row; row <= bottomRight.row; row++) {
        for (let col = topLeft.col; col <= bottomRight.col; col++) {
            // Ensure gridRow and gridCol are within bounds
            if (row >= 0 && row < GRID_HEIGHT_CELLS && col >= 0 && col < GRID_WIDTH_CELLS) {
                if (grid[row][col] !== 0) { // Only change color if the cell is alive
                    grid[row][col] = newColor;
                }
            }
        }
    }
    draw(); // Redraw the grid after recoloring
    clearSelectionState(); // Clear visual selection
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
        case GAME_MODE_RECOLOR: // New case for recolor mode
            if (!isSelecting) {
                // First click for selection
                selectionStart = { row, col };
                selectionCurrentCorner = { row, col }; // Initialize for live preview
                isSelecting = true;
                draw(); // Redraw to show initial selection point
            } else {
                // Second click for selection
                recolorSelection({ row, col }, CURRENT_DRAWING_COLOR); // Apply recolor
                // isSelecting is set to false inside recolorSelection via clearSelectionState
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
        // Apply to both copy and recolor modes for live selection preview
        if ((currentEditingMode === GAME_MODE_COPY || currentEditingMode === GAME_MODE_RECOLOR) && isSelecting && selectionStart) {
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
        case GAME_MODE_RECOLOR: // Apply live preview to recolor mode as well
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
    if ([GAME_MODE_CREATE, GAME_MODE_DESTROY, GAME_MODE_COPY, GAME_MODE_PASTE, GAME_MODE_RECOLOR].includes(mode)) {
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
 * Sets the hue and saturation mutation speed for new cell reproduction.
 * @param {number} newMutationSpeed The new mutation speed (0-50).
 */
export function setMutationHueSatSpeed(newMutationSpeed) {
    MUTATION_H_S_SPEED = newMutationSpeed;
}

/**
 * Sets the lightness mutation speed for new cell reproduction.
 * @param {number} newMutationSpeed The new mutation speed (0-50).
 */
export function setMutationLightnessSpeed(newMutationSpeed) {
    MUTATION_L_SPEED = newMutationSpeed;
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
 * Saves the current game board state to a CSV file and triggers a download.
 */
export function saveBoard() {
    // Pause the game if it's running, so the state doesn't change during save
    const wasRunning = isRunning;
    if (wasRunning) {
        pauseGame();
    }

    const csvRows = [];
    for (let r = 0; r < GRID_HEIGHT_CELLS; r++) {
        const rowData = [];
        for (let c = 0; c < GRID_WIDTH_CELLS; c++) {
            // If the cell is dead (0), use "DEAD". Otherwise, use its hex color.
            rowData.push(grid[r][c] === 0 ? 'DEAD' : grid[r][c]);
        }
        csvRows.push(rowData.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    // Create a URL for the Blob and set it as the download link's href
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'game_of_life_board.csv');
    link.style.visibility = 'hidden'; // Make the link invisible
    document.body.appendChild(link); // Append to body to make it clickable

    link.click(); // Programmatically click the link to trigger download

    // Clean up: remove the link and revoke the object URL after a short delay
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log("Game board saved to game_of_life_board.csv");

    // Resume the game if it was running before saving
    if (wasRunning) {
        startGame();
    }
}

/**
 * Loads a game board state from a CSV content string.
 * @param {string} csvContent The CSV string representing the board.
 */
export function loadBoard(csvContent) {
    const wasRunning = isRunning;
    if (wasRunning) {
        pauseGame();
    }

    try {
        const rows = csvContent.trim().split('\n');
        if (rows.length === 0) {
            console.warn("CSV content is empty.");
            return;
        }

        const newLoadedGrid = [];
        let newWidth = 0;

        for (const rowString of rows) {
            const cells = rowString.split(',');
            if (newWidth === 0) {
                newWidth = cells.length; // Determine width from the first row
            } else if (cells.length !== newWidth) {
                console.warn("CSV rows have inconsistent lengths. Loading may be incorrect.");
                // We'll proceed, but the board might look odd if it's not rectangular
            }
            
            const newRow = cells.map(cell => cell.trim() === 'DEAD' ? 0 : cell.trim());
            newLoadedGrid.push(newRow);
        }

        const newHeight = newLoadedGrid.length;

        // Update global grid dimensions to match the loaded board
        GRID_WIDTH_CELLS = newWidth;
        GRID_HEIGHT_CELLS = newHeight;
        grid = newLoadedGrid; // Replace current grid with the loaded one

        updateCanvasDimensionsAndDraw(); // Update canvas dimensions and redraw the loaded grid
        copyBuffer = null; // Clear copy buffer as the board has fundamentally changed
        clearSelectionState(); // Clear any active selection state

        console.log(`Game board loaded from CSV. New dimensions: ${GRID_WIDTH_CELLS}x${GRID_HEIGHT_CELLS}`);
    } catch (error) {
        console.error("Error loading board from CSV:", error);
        alert("Failed to load board. Please ensure the file is a valid game board CSV.");
        // Revert to initial state or clear if loading failed severely
        resetGame(); 
    } finally {
        if (wasRunning) {
            startGame();
        }
    }
}

/**
 * Returns the current game configuration (cell size, grid dimensions, current drawing color, mutation speeds).
 * @returns {{cellSize: number, gridWidth: number, gridHeight: number, cellColor: string, mutationHueSatSpeed: number, mutationLightnessSpeed: number}}
 */
export function getGameConfig() {
    return {
        cellSize: CELL_SIZE,
        gridWidth: GRID_WIDTH_CELLS,
        gridHeight: GRID_HEIGHT_CELLS,
        cellColor: CURRENT_DRAWING_COLOR,
        mutationHueSatSpeed: MUTATION_H_S_SPEED,
        mutationLightnessSpeed: MUTATION_L_SPEED
    };
}