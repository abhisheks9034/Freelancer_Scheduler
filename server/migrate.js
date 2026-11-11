require('dotenv').config();
const pool = require('./config/db');

async function migrate() {
    try {
        console.log("Creating services table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS services (
                id INT AUTO_INCREMENT PRIMARY KEY,
                freelancer_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                duration_minutes INT NOT NULL DEFAULT 60,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (freelancer_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);
        console.log("Services table created/verified.");

        console.log("Updating availability table...");
        try {
            await pool.query(`ALTER TABLE availability ADD COLUMN service_id INT DEFAULT NULL;`);
            console.log("Added service_id column.");
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') console.log("service_id column already exists.");
            else throw e;
        }

        try {
            await pool.query(`ALTER TABLE availability ADD CONSTRAINT fk_availability_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;`);
            console.log("Added foreign key for service_id.");
        } catch (e) {
            if (e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_CANT_CREATE_TABLE') console.log("FK for service_id might already exist. Ignoring.");
            else console.log("FK issue:", e.message);
        }

        try {
            await pool.query(`ALTER TABLE availability ADD COLUMN agreed_price DECIMAL(10, 2) DEFAULT NULL;`);
            console.log("Added agreed_price column.");
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') console.log("agreed_price column already exists.");
            else throw e;
        }

        console.log("Migration complete!");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
