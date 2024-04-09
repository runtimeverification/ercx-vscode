import * as vscode from 'vscode';

export enum TestLevel {
  Individual,
  Level,
  Root,
}

export enum TestSuiteStandard {
  ERC20 = 'ERC20',
  ERC721 = 'ERC721',
  ERC1155 = 'ERC1155',
  ERC4626 = 'ERC4626',
}

export enum PropertyTestLevel {
  Abi = 'abi',
  Standard = 'standard',
  Security = 'security',
  Features = 'features',
  Status = 'status',
}

export const FreePropertyTestLevels = [
  PropertyTestLevel.Abi,
  PropertyTestLevel.Standard,
  PropertyTestLevel.Status,
];

export interface PropertyTest {
  name: string;
  version: number;
  level: string;
  property: string;
  feedback: string;
  expected: string;
  inconclusive: string;
  concernedFunctions: string[];
  categories: string[];
}

export enum TestResult {
  Failed = 0,
  NotTested = -1,
  Inconclusive = -2,
  Passed = 1,
}

export enum TaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  DONE = 'DONE',
  ERROR = 'ERROR',
  EVALUATED_ONLY_TEST = 'EVALUATED_ONLY_TEST',
  EVALUATED_TESTED_LEVELS = 'EVALUATED_TESTED_LEVELS',
}

export interface Evaluation {
  test: PropertyTest;
  result: TestResult;
  createdAt: Date;
  updatedAt: Date;
}

export interface ERCxTestData {
  testItem: vscode.TestItem;
  contractName: string;
  testLevel: TestLevel;
  standard: string;
}

export interface Feedback {
  feedback: string;
  mutant_id: number;
  similarity: number;
  mutation_type: string;
}

export interface Report {
  id: string;
  tokenClass?: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  status: TaskStatus;
  standard: TestSuiteStandard;
  evaluations?: Evaluation[];
  error?: string;
  feedback: {
    feedbacks: Feedback[];
  };
}

export type RateLimit = {
  evaluations: {
    limit: number;
    remaining: number;
    reset: string;
  };
};
