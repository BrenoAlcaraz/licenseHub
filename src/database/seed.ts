// Sample data described in specs/reports.spec.md (the report numbers there
// are calculated from exactly this data).
//
// Usage: `npm run seed` (host, uses .env) or
//        `docker compose exec api node dist/database/seed.js` (container).
import { MikroORM } from '@mikro-orm/postgresql';
import { EmployeeStatus } from '../employees/employee-status.enum';
import { Employee } from '../employees/employee.entity';
import { LicenseAssignment } from '../licenses/license-assignment.entity';
import mikroOrmConfig from '../mikro-orm.config';
import { Product } from '../products/product.entity';

const PRODUCTS = [
  {
    name: 'Microsoft 365 E3',
    vendor: 'Microsoft',
    monthlyCostCents: 18900,
    totalSeats: 10,
  },
  { name: 'Slack Pro', vendor: 'Slack', monthlyCostCents: 4500, totalSeats: 5 },
  {
    name: 'Adobe Creative Cloud',
    vendor: 'Adobe',
    monthlyCostCents: 27500,
    totalSeats: 3,
  },
  {
    name: 'Jira Software',
    vendor: 'Atlassian',
    monthlyCostCents: 4000,
    totalSeats: 8,
  },
];

const EMPLOYEES = [
  { name: 'Ana Souza', email: 'ana.souza@empresa.com', department: 'IT' },
  { name: 'Bruno Lima', email: 'bruno.lima@empresa.com', department: 'IT' },
  { name: 'Carla Mendes', email: 'carla.mendes@empresa.com', department: 'IT' },
  { name: 'Diego Rocha', email: 'diego.rocha@empresa.com', department: 'IT' },
  {
    name: 'Elisa Martins',
    email: 'elisa.martins@empresa.com',
    department: 'HR',
  },
  {
    name: 'Fábio Lima',
    email: 'fabio.lima@empresa.com',
    department: 'HR',
    status: EmployeeStatus.ON_LEAVE,
  },
  {
    name: 'Gabriela Nunes',
    email: 'gabriela.nunes@empresa.com',
    department: 'HR',
  },
  {
    name: 'Hugo Alves',
    email: 'hugo.alves@empresa.com',
    department: 'Finance',
  },
  {
    name: 'Isabela Costa',
    email: 'isabela.costa@empresa.com',
    department: 'Finance',
  },
  {
    name: 'João Pereira',
    email: 'joao.pereira@empresa.com',
    department: 'Finance',
  },
];

// Product name -> employee names with an active license.
// Microsoft 365 E3 has 3 idle seats, Slack Pro is full (5/5), Fábio keeps his
// license while ON_LEAVE (RN08) and João has none.
const ASSIGNMENTS: Record<string, string[]> = {
  'Microsoft 365 E3': [
    'Ana Souza',
    'Bruno Lima',
    'Carla Mendes',
    'Diego Rocha',
    'Elisa Martins',
    'Fábio Lima',
    'Hugo Alves',
  ],
  'Slack Pro': [
    'Ana Souza',
    'Bruno Lima',
    'Carla Mendes',
    'Gabriela Nunes',
    'Isabela Costa',
  ],
  'Adobe Creative Cloud': ['Elisa Martins'],
  'Jira Software': ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha'],
};

async function seed(): Promise<void> {
  const orm = await MikroORM.init(mikroOrmConfig);
  try {
    const em = orm.em.fork();

    // Never wipe existing data: ask for an explicit reset instead.
    if ((await em.count(Product)) > 0 || (await em.count(Employee)) > 0) {
      throw new Error(
        'Database is not empty. Reset it with `docker compose down -v` and start again.',
      );
    }

    await em.transactional((tx) => {
      const products = new Map(
        PRODUCTS.map((data) => [data.name, tx.create(Product, data)]),
      );
      const employees = new Map(
        EMPLOYEES.map((data) => [data.name, tx.create(Employee, data)]),
      );
      for (const [productName, employeeNames] of Object.entries(ASSIGNMENTS)) {
        for (const employeeName of employeeNames) {
          tx.create(LicenseAssignment, {
            product: products.get(productName)!,
            employee: employees.get(employeeName)!,
          });
        }
      }
      return Promise.resolve();
    });

    const assignmentCount = Object.values(ASSIGNMENTS).flat().length;
    console.log(
      `Seed done: ${PRODUCTS.length} products, ${EMPLOYEES.length} employees, ${assignmentCount} license assignments.`,
    );
  } finally {
    await orm.close();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
