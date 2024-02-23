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
}

export interface PropertyTest {
  name: string;
  version: number;
  level: string;
  property: string;
  feedback: string;
  expected: string;
  concernedFunctions: string[];
  categories: string[];
}

export enum TestResult {
  Failed = 0,
  NotTested = -1,
  Passed = 1,
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
